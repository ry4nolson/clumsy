import { AnnotationEditorType, PDFDateString, type PDFDocumentProxy } from "pdfjs-dist";
import type { EventBus, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { CommentTarget } from "./commentPopup";
import type { CommentEntry } from "./comments";
import { NOTE_COLOR, NOTE_KEY_PREFIX, changedNote, movedNote, newNote, noteFromAnnotation, notesIn, pdfDate, visibleNotes, type StickyNote } from "./notes";

type Viewport = { width: number; height: number; convertToViewportPoint(x: number, y: number): number[]; convertToPdfPoint(x: number, y: number): number[] };

type NotePageView = { div?: HTMLDivElement; viewport: Viewport; pdfPage: { getAnnotations(): Promise<unknown[]> } | null };

type NoteAnnotation = Parameters<typeof noteFromAnnotation>[0];

export type NoteTarget = CommentTarget & {
  uid: string;
  getData(): ReturnType<CommentTarget["getData"]> & { id: string; pageIndex: number; rect: number[] };
  focusCommentButton(): void;
  commentButtonWidth: number;
};

export type NoteHooks = {
  toggle(target: NoteTarget, isSelected: boolean, visibility?: boolean, isEditable?: boolean): void;
  isPopupPinned(): boolean;
  hidePopup(id?: string): void;
  editComment(target: NoteTarget, x: number, y: number, options: { height?: number; parentDimensions: DOMRect }): void;
  addCommands(command: { cmd: () => void; undo: () => void; mustExec: boolean }): void;
  makeColor(color: number[] | null, opacity: number): string | null;
  removed(): void;
  changed(): void;
};

type NoteDrag = { id: string; button: HTMLButtonElement; pointerId: number; x: number; y: number; left: number; top: number; moving: boolean };

const SVG = "http://www.w3.org/2000/svg";
const DRAG_THRESHOLD = 4;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

function noteIcon() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const [className, d] of [
    ["bubble", "M4 2.5h16A2.5 2.5 0 0 1 22.5 5v10a2.5 2.5 0 0 1-2.5 2.5h-8.5l-5 4v-4H4A2.5 2.5 0 0 1 1.5 15V5A2.5 2.5 0 0 1 4 2.5z"],
    ["lines", "M6 7.5h12M6 11h12M6 14.5h7"],
  ]) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("class", className);
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

export function attachStickyNotes(viewer: PDFViewer, eventBus: EventBus, linkService: PDFLinkService, hooks: NoteHooks) {
  const container = viewer.container as HTMLDivElement;
  let doc: PDFDocumentProxy | null = null;
  let fileNotes = new Map<number, StickyNote[]>();
  let loading = new Set<number>();
  let allLoaded: Promise<void> | null = null;
  let positions = new Map<string, [number, number]>();
  let targets = new Map<string, NoteTarget>();
  let drafts = new Map<string, StickyNote>();
  let revealing: string | null = null;
  let dismissing = false;
  let drag: NoteDrag | null = null;
  let dropped = false;

  const changes = () => notesIn(doc?.annotationStorage ?? []);
  const pageView = (pageIndex: number) => viewer.getPageView(pageIndex) as unknown as NotePageView | undefined;
  const allNotes = () => visibleNotes([...fileNotes.values()].flat(), changes());
  const findNote = (id: string) => drafts.get(id) ?? allNotes().find((note) => note.id === id) ?? null;
  const buttonFor = (id: string) => container.querySelector<HTMLButtonElement>(`.sticky-note[data-note="${CSS.escape(id)}"]`);
  const layerOf = (id: string) => buttonFor(id)?.parentElement ?? container;

  const defaultPosition = (id: string): [number, number] => {
    const button = buttonFor(id);
    const layer = button?.parentElement;
    if (!button || !layer) {
      return [0, 0];
    }
    return [button.offsetLeft / layer.offsetWidth, (button.offsetTop + button.offsetHeight + 4) / layer.offsetHeight];
  };

  const target = (id: string) => {
    const existing = targets.get(id);
    if (existing) {
      return existing;
    }
    const created: NoteTarget = {
      uid: id,
      getData: () => {
        const note = findNote(id);
        return {
          id,
          pageIndex: note?.pageIndex ?? 0,
          rect: note?.rect ?? [0, 0, 0, 0],
          contentsObj: { str: note?.text ?? "", dir: "auto" },
          richText: null,
          creationDate: null,
          modificationDate: note?.date ?? null,
          color: note?.color ?? NOTE_COLOR,
          opacity: 1,
        };
      },
      setCommentButtonStates: ({ selected, hasPopup }) => {
        const button = buttonFor(id);
        button?.classList.toggle("selected", selected);
        button?.setAttribute("aria-expanded", String(hasPopup));
      },
      get commentPopupPosition() {
        return positions.get(id) ?? defaultPosition(id);
      },
      set commentPopupPosition(position) {
        positions.set(id, position);
      },
      hasDefaultPopupPosition: () => !positions.has(id),
      get commentButtonWidth() {
        const button = buttonFor(id);
        return button ? button.offsetWidth / layerOf(id).offsetWidth : 0;
      },
      get parentBoundingClientRect() {
        return layerOf(id).getBoundingClientRect();
      },
      get elementBeforePopup() {
        return buttonFor(id) ?? layerOf(id);
      },
      editComment: (options) => {
        const [x, y] = created.commentPopupPosition;
        const box = layerOf(id).getBoundingClientRect();
        hooks.editComment(created, box.x + x * box.width, box.y + y * box.height, { ...options, parentDimensions: box });
      },
      get comment() {
        return findNote(id)?.text ?? null;
      },
      set comment(text: CommentTarget["comment"]) {
        change(id, typeof text === "string" ? text : null);
      },
      focus: () => buttonFor(id)?.focus(),
      focusCommentButton: () => buttonFor(id)?.focus(),
    };
    targets.set(id, created);
    return created;
  };

  const createButton = (id: string) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sticky-note";
    button.dataset.note = id;
    button.ariaHasPopup = "dialog";
    button.append(noteIcon());
    button.addEventListener("pointerenter", () => hooks.toggle(target(id), false, true, true));
    button.addEventListener("pointerleave", () => hooks.toggle(target(id), false, false));
    button.addEventListener("pointerdown", (event) => startDrag(id, button, event));
    button.addEventListener("pointermove", dragTo);
    button.addEventListener("pointerup", endDrag);
    button.addEventListener("pointercancel", endDrag);
    button.addEventListener("lostpointercapture", endDrag);
    button.addEventListener("click", () => {
      if (!dropped) {
        hooks.toggle(target(id), true, undefined, true);
      }
    });
    return button;
  };

  const paint = (pageIndex: number) => {
    const view = pageView(pageIndex);
    if (!view?.div || !fileNotes.has(pageIndex)) {
      return;
    }
    const notes = visibleNotes(fileNotes.get(pageIndex) ?? [], changes(), pageIndex);
    let layer = view.div.querySelector<HTMLDivElement>(":scope > .sticky-notes");
    if (!layer && notes.length) {
      layer = document.createElement("div");
      layer.className = "sticky-notes";
    }
    if (!layer) {
      return;
    }
    if (!layer.isConnected) {
      view.div.append(layer);
    }
    const stale = new Map([...layer.querySelectorAll<HTMLButtonElement>(":scope > .sticky-note")].map((button) => [button.dataset.note!, button]));
    const { viewport } = view;
    for (const note of notes) {
      const button = stale.get(note.id) ?? createButton(note.id);
      stale.delete(note.id);
      const [x, y] = viewport.convertToViewportPoint(note.rect[0], note.rect[3]);
      const [red, green, blue] = note.color ?? NOTE_COLOR;
      button.style.left = `${(100 * x) / viewport.width}%`;
      button.style.top = `${(100 * y) / viewport.height}%`;
      button.style.setProperty("--note-color", `rgb(${red} ${green} ${blue})`);
      button.ariaLabel = note.text ? `Comment: ${note.text}` : "Comment";
      if (!button.isConnected) {
        layer.append(button);
      }
    }
    for (const [id, button] of stale) {
      hooks.hidePopup(id);
      button.remove();
    }
    if (!notes.length && !layer.querySelector(".commentPopup:not(.hidden)")) {
      layer.remove();
    }
    if (revealing && notes.some((note) => note.id === revealing)) {
      const id = revealing;
      revealing = null;
      hooks.toggle(target(id), true, true, true);
    }
  };

  const paintAll = () => fileNotes.forEach((_, pageIndex) => paint(pageIndex));

  const reset = () => {
    doc = viewer.pdfDocument ?? null;
    fileNotes = new Map();
    loading = new Set();
    allLoaded = null;
    positions = new Map();
    targets = new Map();
    drafts = new Map();
    revealing = null;
  };

  const loadPage = (pageIndex: number) => {
    if ((viewer.pdfDocument ?? null) !== doc) {
      reset();
    }
    if (fileNotes.has(pageIndex)) {
      paint(pageIndex);
      return;
    }
    const page = pageView(pageIndex)?.pdfPage;
    if (!page || loading.has(pageIndex)) {
      return;
    }
    loading.add(pageIndex);
    const owner = doc;
    page
      .getAnnotations()
      .catch(() => [])
      .then((annotations) => {
        if (doc === owner && !fileNotes.has(pageIndex)) {
          fileNotes.set(pageIndex, (annotations as NoteAnnotation[]).flatMap((annotation) => noteFromAnnotation(annotation, pageIndex) ?? []));
          paint(pageIndex);
        }
      });
  };

  const loadAll = () => {
    const owner = doc;
    allLoaded ??= (owner?.getAnnotationsByType(new Set([1]), new Set()) ?? Promise.resolve([]))
      .catch(() => [])
      .then((annotations) => {
        if (doc !== owner || !owner) {
          return;
        }
        const byPage = new Map<number, StickyNote[]>();
        for (const note of (annotations as NoteAnnotation[]).flatMap((annotation) => noteFromAnnotation(annotation) ?? [])) {
          byPage.set(note.pageIndex, [...(byPage.get(note.pageIndex) ?? []), note]);
        }
        for (let pageIndex = 0; pageIndex < owner.numPages; pageIndex++) {
          fileNotes.set(pageIndex, byPage.get(pageIndex) ?? []);
        }
        paintAll();
      });
    return allLoaded;
  };

  const put = (id: string, value: StickyNote | null, pageIndex: number) => {
    const storage = doc?.annotationStorage;
    if (!storage) {
      return;
    }
    const key = NOTE_KEY_PREFIX + id;
    storage.remove(key);
    if (value) {
      storage.setValue(key, { ...value });
    }
    if (!fileNotes.has(pageIndex)) {
      fileNotes.set(pageIndex, []);
    }
    paint(pageIndex);
    hooks.changed();
  };

  const change = (id: string, text: string | null) => {
    const draft = drafts.get(id);
    drafts.delete(id);
    const current = draft ?? findNote(id);
    if (!current) {
      return;
    }
    const after = changedNote(current, text, pdfDate(new Date()));
    if ((draft && !after) || (after && !after.deleted && after.text === current.text)) {
      return;
    }
    commit(id, current.pageIndex, after);
    if (!draft && (!after || after.deleted)) {
      hooks.removed();
    }
  };

  const commit = (id: string, pageIndex: number, after: StickyNote | null) => {
    const before = (doc?.annotationStorage.getRawValue(NOTE_KEY_PREFIX + id) as StickyNote | undefined) ?? null;
    hooks.addCommands({ cmd: () => put(id, after, pageIndex), undo: () => put(id, before, pageIndex), mustExec: true });
  };

  const startDrag = (id: string, button: HTMLButtonElement, event: PointerEvent) => {
    if (drag || event.button !== 0) {
      return;
    }
    button.setPointerCapture(event.pointerId);
    drag = { id, button, pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: button.offsetLeft, top: button.offsetTop, moving: false };
  };

  const dragTo = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const { button } = drag;
    const layer = button.parentElement;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!layer || (!drag.moving && Math.hypot(dx, dy) < DRAG_THRESHOLD)) {
      return;
    }
    if (!drag.moving) {
      drag.moving = true;
      hooks.hidePopup(drag.id);
      button.classList.add("dragging");
    }
    const left = clamp(drag.left + dx, 0, layer.offsetWidth - button.offsetWidth);
    const top = clamp(drag.top + dy, 0, layer.offsetHeight - button.offsetHeight);
    button.style.left = `${(100 * left) / layer.offsetWidth}%`;
    button.style.top = `${(100 * top) / layer.offsetHeight}%`;
  };

  const endDrag = (event: PointerEvent) => {
    const ended = drag;
    if (!ended || event.pointerId !== ended.pointerId) {
      return;
    }
    drag = null;
    if (!ended.moving) {
      return;
    }
    const { id, button } = ended;
    button.classList.remove("dragging");
    dropped = true;
    setTimeout(() => {
      dropped = false;
    });
    const note = findNote(id);
    const view = note && pageView(note.pageIndex);
    const layer = button.parentElement;
    if (!note || !view || !layer) {
      return;
    }
    if (event.type !== "pointerup" || (button.offsetLeft === ended.left && button.offsetTop === ended.top)) {
      paint(note.pageIndex);
      return;
    }
    const { viewport } = view;
    const point = viewport.convertToPdfPoint((viewport.width * button.offsetLeft) / layer.offsetWidth, (viewport.height * button.offsetTop) / layer.offsetHeight);
    positions.delete(id);
    commit(id, note.pageIndex, movedNote(note, point, pdfDate(new Date())));
  };

  const onPointerDown = () => {
    dismissing = hooks.isPopupPinned() || !!container.querySelector(".annotationEditorLayer .selectedEditor");
  };

  const writable = () => !!doc && (viewer.pdfDocument ?? null) === doc;

  const addAt = (pageDiv: HTMLElement, clientX: number, clientY: number) => {
    const pageIndex = Number(pageDiv.dataset.pageNumber) - 1;
    const view = pageView(pageIndex);
    if (!view || !writable()) {
      return false;
    }
    const box = pageDiv.getBoundingClientRect();
    const point = view.viewport.convertToPdfPoint(clientX - box.left, clientY - box.top);
    const id = `note-${crypto.randomUUID()}`;
    drafts.forEach((_, draft) => targets.delete(draft));
    drafts = new Map([[id, newNote(id, pageIndex, point, "", pdfDate(new Date()))]]);
    hooks.editComment(target(id), clientX, clientY, { parentDimensions: box });
    return true;
  };

  const onClick = (event: MouseEvent) => {
    const layer = event.target as HTMLElement | null;
    const pageDiv = layer?.closest<HTMLElement>(".page");
    if (dropped || !pageDiv || !layer?.classList.contains("annotationEditorLayer")) {
      return;
    }
    if ((viewer.annotationEditorMode as unknown as number) !== AnnotationEditorType.POPUP) {
      return;
    }
    if (dismissing) {
      hooks.hidePopup();
      return;
    }
    addAt(pageDiv, event.clientX, event.clientY);
  };

  const onRendered = ({ source, isDetailView }: { source: { id: number }; isDetailView?: boolean }) => {
    if (!isDetailView) {
      loadPage(source.id - 1);
    }
  };

  eventBus.on("pagesinit", reset);
  eventBus.on("pagerendered", onRendered);
  eventBus.on("scalechanging", paintAll);
  eventBus.on("rotationchanging", paintAll);
  container.addEventListener("pointerdown", onPointerDown, true);
  container.addEventListener("click", onClick);

  return {
    has: (id: string) => !!findNote(id),
    writable,
    addAt,
    async entries(): Promise<CommentEntry[]> {
      await loadAll();
      return allNotes()
        .filter((note) => note.text)
        .map((note) => ({
          id: note.id,
          pageIndex: note.pageIndex,
          rect: note.rect,
          time: PDFDateString.toDateObject(note.date ?? "")?.getTime() ?? null,
          text: note.text,
          color: hooks.makeColor(note.color, 1),
        }));
    },
    reveal(id: string) {
      const note = findNote(id);
      if (!note) {
        return;
      }
      revealing = id;
      linkService.goToXY(note.pageIndex + 1, note.rect[0], note.rect[3], { center: "both" });
      paint(note.pageIndex);
    },
    dispose() {
      eventBus.off("pagesinit", reset);
      eventBus.off("pagerendered", onRendered);
      eventBus.off("scalechanging", paintAll);
      eventBus.off("rotationchanging", paintAll);
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("click", onClick);
    },
  };
}

export type StickyNotes = ReturnType<typeof attachStickyNotes>;
