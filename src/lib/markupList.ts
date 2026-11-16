import { PDFDateString, type PDFDocumentProxy } from "pdfjs-dist";
import type { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import { readAuthorName } from "./authorName";
import type { UndoableCommand } from "./commentManager";
import type { Markup } from "./markup";
import { listedAnnotationTypes, sortRows, type MarkupRow, type ReviewStatus } from "./markupRows";
import { assembleRows, type AnnotationRecord, type EditorRecord } from "./markupSources";
import { NOTE_KEY_PREFIX, notesIn, pdfDate, type StickyNote } from "./notes";
import { stateReplyNote } from "./reviewState";

type ListLayer = { listAll(): Promise<{ markup: Markup[]; fileIds: Set<string>; subjects: Record<string, string> }>; removal(ids: string[]): UndoableCommand | null; show(id: string): void };

type ListDeps = {
  markup: () => ListLayer | null;
  revealNote: (id: string) => void;
  noteRemoval: (ids: string[]) => Promise<UndoableCommand | null>;
  addCommands: (command: UndoableCommand) => void;
  removed: () => void;
  changed: () => void;
};

type ListPageView = { div?: HTMLDivElement; viewport: { convertToViewportPoint(x: number, y: number): number[] } };

type SerializingEditor = { serialize(isForCopying: boolean, context: null): (EditorRecord & { page?: number }) | null };

const EDITOR_KEY = "pdfjs_internal_editor_";
const FLASH_MS = 1200;
const CHANGE_DELAY = 150;

const time = (date: string | null | undefined) => (date ? (PDFDateString.toDateObject(date)?.getTime() ?? null) : null);

const FILE_REF = /^\d+R$/;

const canSetStatus = (row: MarkupRow) => row.source !== "editor" && (FILE_REF.test(row.id) || row.source === "clumsy");

const isEditor = (value: unknown): value is SerializingEditor => typeof (value as SerializingEditor | null)?.serialize === "function";

function editorsIn(storage: Iterable<[string, unknown]>) {
  const editors: EditorRecord[] = [];
  for (const [key, value] of storage) {
    if (!key.startsWith(EDITOR_KEY) || !isEditor(value)) {
      continue;
    }
    try {
      const data = value.serialize(false, null);
      if (data) {
        editors.push({ ...data, key, pageIndex: data.pageIndex ?? data.page ?? 0 });
      }
    } catch {
      continue;
    }
  }
  return editors;
}

export function createMarkupList(viewer: PDFViewer, deps: ListDeps) {
  const annotations = new WeakMap<PDFDocumentProxy, Promise<AnnotationRecord[]>>();
  const watched = new WeakSet<object>();
  let timer = 0;
  let notes = new Map<string, MarkupRow>();
  let shown: (() => MarkupRow[]) | null = null;
  let watching = false;

  const changedSoon = () => {
    if (watching) {
      window.clearTimeout(timer);
      timer = window.setTimeout(deps.changed, CHANGE_DELAY);
    }
  };

  const watchStorage = (doc: PDFDocumentProxy) => {
    const storage = doc.annotationStorage as unknown as { setValue(key: string, value: unknown): void; remove(key: string): void };
    if (watched.has(storage)) {
      return;
    }
    watched.add(storage);
    const { setValue, remove } = storage;
    storage.setValue = function (key, value) {
      setValue.call(this, key, value);
      changedSoon();
    };
    storage.remove = function (key) {
      remove.call(this, key);
      changedSoon();
    };
  };

  const annotationsOf = (doc: PDFDocumentProxy) => {
    let found = annotations.get(doc);
    if (!found) {
      found = doc
        .getAnnotationsByType(new Set(listedAnnotationTypes), new Set())
        .then((list) => (list ?? []) as unknown as AnnotationRecord[])
        .catch(() => []);
      annotations.set(doc, found);
    }
    return found;
  };


  const flash = (row: MarkupRow) => {
    const view = viewer.getPageView(row.pageIndex) as unknown as ListPageView | undefined;
    if (!view?.div) {
      return;
    }
    const [x1, y1] = view.viewport.convertToViewportPoint(row.rect[0], row.rect[1]);
    const [x2, y2] = view.viewport.convertToViewportPoint(row.rect[2], row.rect[3]);
    const container = viewer.container;
    container.scrollTo({ left: view.div.offsetLeft + (x1 + x2) / 2 - container.clientWidth / 2, top: view.div.offsetTop + (y1 + y2) / 2 - container.clientHeight / 2 });
    const outline = document.createElement("div");
    outline.className = "markup-flash";
    Object.assign(outline.style, { left: `${Math.min(x1, x2)}px`, top: `${Math.min(y1, y2)}px`, width: `${Math.abs(x2 - x1)}px`, height: `${Math.abs(y2 - y1)}px` });
    view.div.append(outline);
    window.setTimeout(() => outline.remove(), FLASH_MS);
  };

  const collect = async (pageLabels: string[] | null): Promise<MarkupRow[] | null> => {
    const doc = viewer.pdfDocument;
    const layer = deps.markup();
    if (!doc || !layer) {
      return null;
    }
    watchStorage(doc);
    const [records, clumsy] = await Promise.all([annotationsOf(doc), layer.listAll()]);
    if (viewer.pdfDocument !== doc) {
      return null;
    }
    const storage = doc.annotationStorage as unknown as Iterable<[string, unknown]>;
    const rows = assembleRows({
      annotations: records,
      subjects: clumsy.subjects,
      clumsy: clumsy.markup,
      clumsyFileIds: clumsy.fileIds,
      noteChanges: notesIn(storage),
      editors: editorsIn(storage),
      pageLabels,
      author: readAuthorName(),
      time,
    });
    notes = new Map(rows.filter((row) => row.target === "note").map((row) => [row.id, row]));
    return rows;
  };

  return {
    collect,
    changed: changedSoon,
    watch(on: boolean) {
      watching = on;
      if (!on) {
        window.clearTimeout(timer);
      }
    },
    showing(provider: (() => MarkupRow[]) | null) {
      shown = provider;
    },
    async exportRows(pageLabels: string[] | null) {
      return shown ? shown() : sortRows((await collect(pageLabels)) ?? [], "page");
    },
    show(row: MarkupRow) {
      if (row.target === "markup") {
        deps.markup()?.show(row.id);
      } else if (row.target === "note" && notes.has(row.id)) {
        deps.revealNote(row.id);
      } else {
        flash(row);
      }
    },
    canSetStatus,
    setStatus(rows: MarkupRow[], status: ReviewStatus) {
      const storage = viewer.pdfDocument?.annotationStorage;
      const author = readAuthorName();
      const date = pdfDate(new Date());
      const replies: StickyNote[] = rows.filter(canSetStatus).map((row) => stateReplyNote(`state-${crypto.randomUUID()}`, row, status, author, date));
      if (!storage || !replies.length) {
        return;
      }
      deps.addCommands({
        cmd: () => replies.forEach((reply) => storage.setValue(NOTE_KEY_PREFIX + reply.id, { ...reply })),
        undo: () => replies.forEach((reply) => storage.remove(NOTE_KEY_PREFIX + reply.id)),
        mustExec: true,
      });
    },
    canRemove: (row: MarkupRow) => row.target === "markup" || row.target === "note",
    async remove(rows: MarkupRow[]) {
      const noteCommand = await deps.noteRemoval(rows.filter((row) => row.target === "note").map((row) => row.id));
      const markupCommand = deps.markup()?.removal(rows.filter((row) => row.target === "markup").map((row) => row.id)) ?? null;
      const commands = [markupCommand, noteCommand].filter((command): command is UndoableCommand => !!command);
      if (!commands.length) {
        return;
      }
      deps.addCommands({
        cmd: () => commands.forEach((command) => command.cmd()),
        undo: () => [...commands].reverse().forEach((command) => command.undo()),
        mustExec: true,
      });
      deps.removed();
    },
    dispose() {
      window.clearTimeout(timer);
    },
  };
}

export type MarkupList = ReturnType<typeof createMarkupList>;
