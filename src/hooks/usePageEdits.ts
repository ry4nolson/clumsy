import { useCallback, useRef } from "react";
import type { PageAction } from "../components/DocumentTab";
import type { CommandId } from "../lib/commands";
import { dropTargetAt } from "../lib/dropTarget";
import {
  applyPageEdit,
  changesDocument,
  combinePdfs,
  countAfterEdit,
  extractPages,
  pageAfterEdit,
  pageCount,
  pageRanges,
  selectionAfterEdit,
  type PageEdit,
} from "../lib/pageEdits";
import { openedFiles, pickImages, type OpenedFile } from "../lib/imageFiles";
import { imagesIn, imagesToSource, markdownIn, pagesFrom, pdfsIn } from "../lib/imageImport";
import { remapStops } from "../lib/navHistory";
import { trimHistory, type Version } from "../lib/pageHistory";
import { pickPdfs, showContextMenu, showError, type DropPoint, type DroppedFile, type PdfSource } from "../lib/platform";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

type TabEdits = {
  source: PdfSource | null;
  generation: number;
  undo: Version[];
  redo: Version[];
  pending: Version | null;
  queue: Promise<void> | null;
  waiters: Array<() => void>;
  restoring: boolean;
};

class StaleEditError extends Error {}

const baseName = (name: string) => name.replace(/\.pdf$/i, "");

const report = (error: unknown) => {
  if (!(error instanceof StaleEditError)) {
    showError(`Couldn't change pages.\n\n${error instanceof Error ? error.message : String(error)}`);
  }
};

export function usePageEdits({ workspaceRef, snapshotsRef, handles, update, openSource }: WorkspaceApi) {
  const tabs = useRef(new Map<string, TabEdits>());

  const docTab = (tabId: string) => {
    const tab = workspaceRef.current.tabs[tabId];
    return tab?.kind === "document" ? tab : null;
  };

  const editsFor = (tabId: string) => {
    for (const id of tabs.current.keys()) {
      if (!workspaceRef.current.tabs[id]) {
        tabs.current.delete(id);
      }
    }
    let edits = tabs.current.get(tabId);
    if (!edits) {
      edits = { source: null, generation: 0, undo: [], redo: [], pending: null, queue: null, waiters: [], restoring: false };
      tabs.current.set(tabId, edits);
    }
    const source = docTab(tabId)?.source ?? null;
    if (!edits.pending && edits.source !== source) {
      edits.source = source;
      edits.undo = [];
      edits.redo = [];
    }
    return edits;
  };

  const enqueue = useCallback((tabId: string, task: () => Promise<void>) => {
    const edits = editsFor(tabId);
    const next = (edits.queue ?? Promise.resolve()).then(task).catch(report);
    edits.queue = next;
    next.finally(() => {
      if (edits.queue === next) {
        edits.queue = null;
      }
    });
    return next;
  }, []);

  const settled = useCallback(async (tabId: string) => {
    for (;;) {
      const edits = tabs.current.get(tabId);
      if (edits?.queue) {
        await edits.queue;
      } else if (edits?.pending) {
        await new Promise<void>((resolve) => edits.waiters.push(resolve));
      } else {
        return;
      }
    }
  }, []);

  const currentVersion = async (tabId: string): Promise<Version | null> => {
    const edits = editsFor(tabId);
    if (edits.pending) {
      return { ...edits.pending, bytes: edits.pending.bytes.slice() };
    }
    const handle = handles.current.get(tabId);
    const snapshot = snapshotsRef.current[tabId];
    if (!handle || !snapshot?.loaded) {
      return null;
    }
    const bytes = await handle.viewer.save();
    return bytes ? { bytes, page: snapshot.pageNumber - 1, count: snapshot.pagesCount } : null;
  };

  const show = (tabId: string, version: Version, selection: number[], baseline: PdfSource | null, pageAt?: (page: number) => number) => {
    const edits = editsFor(tabId);
    const tab = docTab(tabId);
    if (!tab || tab.source !== baseline) {
      throw new StaleEditError();
    }
    const previous = handles.current.get(tabId)?.viewer.viewState();
    const page = Math.min(Math.max(0, selection[0] ?? version.page), version.count - 1);
    const samePage = previous?.page === page + 1;
    const view = {
      ...previous,
      history: previous?.history && pageAt ? remapStops(previous.history, pageAt) : previous?.history,
      page: page + 1,
      scaleValue: previous?.scaleValue ?? "page-width",
      left: samePage ? previous.left : null,
      top: samePage ? previous.top : null,
      rotation: previous?.rotation ?? 0,
    };
    const source = { ...tab.source, data: version.bytes };
    edits.pending = { ...version, bytes: version.bytes.slice() };
    edits.source = source;
    edits.generation += 1;
    update((current) => ws.replaceTab(current, { ...tab, source, carriedChanges: true, view, selection }));
  };

  const performEdit = async (tabId: string, edit: PageEdit, generation: number) => {
    const edits = editsFor(tabId);
    if (edits.generation !== generation) {
      throw new StaleEditError();
    }
    const baseline = edits.source;
    const before = await currentVersion(tabId);
    if (!before || !changesDocument(edit, before.count)) {
      return;
    }
    const inserted = edit.kind === "insert" ? await pageCount(edit.data) : 0;
    const bytes = await applyPageEdit(before.bytes, edit);
    const page = pageAfterEdit(edit, before.page, before.count, inserted);
    show(
      tabId,
      { bytes, page, count: countAfterEdit(edit, before.count, inserted) },
      selectionAfterEdit(edit, before.count, inserted),
      baseline,
      (old) => pageAfterEdit(edit, old, before.count, inserted),
    );
    edits.undo = trimHistory([...edits.undo, before]);
    edits.redo = [];
  };

  const editPages = useCallback(
    (tabId: string, edit: PageEdit) => {
      const generation = editsFor(tabId).generation;
      return enqueue(tabId, () => performEdit(tabId, edit, generation));
    },
    [enqueue],
  );

  const documentLoaded = useCallback((tabId: string, source: PdfSource) => {
    const edits = tabs.current.get(tabId);
    if (edits && edits.source === source) {
      edits.pending = null;
      edits.restoring = false;
      edits.waiters.splice(0).forEach((resolve) => resolve());
    }
  }, []);

  const documentFailed = useCallback((tabId: string, source: PdfSource) => {
    if (docTab(tabId)?.source !== source) {
      return true;
    }
    const edits = tabs.current.get(tabId);
    const previous = edits?.undo.at(-1);
    if (!edits?.pending || !previous || edits.restoring) {
      return false;
    }
    edits.pending = null;
    edits.restoring = true;
    edits.undo.pop();
    edits.redo = [];
    show(tabId, previous, [], docTab(tabId)?.source ?? null);
    showError("Couldn't open the changed pages, so that change was undone.");
    return true;
  }, []);

  const routeStep = (tabId: string, direction: "undo" | "redo") => {
    const edits = editsFor(tabId);
    if (edits.pending) {
      return edits[direction].length ? "page" : "none";
    }
    const markup = handles.current.get(tabId)?.viewer.editHistory();
    if (direction === "undo") {
      return markup?.canUndo || markup?.changed || !edits.undo.length ? "viewer" : "page";
    }
    if (markup?.canRedo) {
      return "viewer";
    }
    if (markup?.changed || markup?.canUndo) {
      edits.redo = [];
    }
    return edits.redo.length ? "page" : "viewer";
  };

  const stepHistory = useCallback(
    (direction: "undo" | "redo") => {
      const tab = ws.focusedTab(workspaceRef.current);
      if (tab.kind !== "document") {
        return false;
      }
      const edits = editsFor(tab.id);
      if (!edits.queue && !edits.pending && routeStep(tab.id, direction) !== "page") {
        return false;
      }
      enqueue(tab.id, async () => {
        const route = routeStep(tab.id, direction);
        if (route === "viewer") {
          handles.current.get(tab.id)?.viewer.editingAction(direction);
        }
        if (route !== "page") {
          return;
        }
        const baseline = edits.source;
        const target = edits[direction].pop();
        const current = target && (await currentVersion(tab.id));
        if (!target || !current) {
          return;
        }
        show(tab.id, target, [], baseline);
        edits[direction === "undo" ? "redo" : "undo"].push(current);
      });
      return true;
    },
    [enqueue],
  );

  const insertFiles = useCallback(
    (tabId: string, files: OpenedFile[] | Promise<OpenedFile[]>, at: number) => {
      const generation = editsFor(tabId).generation;
      return enqueue(tabId, async () => {
        const data = await pagesFrom(await files);
        if (data) {
          await performEdit(tabId, { kind: "insert", data, at }, generation);
        }
      });
    },
    [enqueue],
  );

  const openFiles = (files: OpenedFile[]) => {
    pdfsIn(files).forEach((source) => openSource(source));
    const images = imagesIn(files);
    if (images.length) {
      const source = imagesToSource(images).catch(async (error: unknown) => {
        await showError(`Couldn't make a PDF from these images.\n\n${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
      openSource(source, { carriedChanges: true });
    }
  };

  const combineFiles = () =>
    pickPdfs()
      .then(async (sources) => {
        const files = await Promise.all(sources);
        if (files.length === 1) {
          await openSource(files[0]);
        } else if (files.length > 1) {
          const data = await combinePdfs(files.map((file) => file.data));
          await openSource({ name: `${baseName(files[0].name)} and ${files.length - 1} more.pdf`, path: null, data }, { carriedChanges: true });
        }
      })
      .catch(report);

  const runPageCommand = useCallback(
    (id: CommandId) => {
      if (id === "combineFiles") {
        combineFiles();
        return true;
      }
      if (id === "newPdfFromImages") {
        pickImages().then(openFiles).catch(report);
        return true;
      }
      const tab = ws.focusedTab(workspaceRef.current);
      const handle = handles.current.get(tab.id);
      if (tab.kind !== "document" || !handle) {
        return false;
      }
      const pages = handle.selectedPages();
      const generation = editsFor(tab.id).generation;
      const actions: Partial<Record<CommandId, () => unknown>> = {
        rotatePagesLeft: () => editPages(tab.id, { kind: "rotate", pages, by: -90 }),
        rotatePagesRight: () => editPages(tab.id, { kind: "rotate", pages, by: 90 }),
        deletePages: () => editPages(tab.id, { kind: "delete", pages }),
        pageLabels: () => handle.editPageLabels(),
        insertPages: () => insertFiles(tab.id, pickImages(true), Math.max(...pages) + 1),
        extractPages: () =>
          enqueue(tab.id, async () => {
            if (editsFor(tab.id).generation !== generation) {
              throw new StaleEditError();
            }
            const current = await currentVersion(tab.id);
            if (current) {
              const data = await extractPages(current.bytes, pages);
              const name = `${baseName(tab.name)} (${pages.length === 1 ? "page" : "pages"} ${pageRanges(pages)}).pdf`;
              await openSource({ name, path: null, data }, { carriedChanges: true });
            }
          }),
      };
      const action = actions[id];
      action?.();
      return !!action;
    },
    [editPages, enqueue, insertFiles, openSource],
  );

  const pageAction = useCallback(
    (tabId: string, action: PageAction, runCommand: (id: CommandId) => void) => {
      if (action.kind === "move") {
        editPages(tabId, { kind: "move", pages: action.pages, to: action.slot });
      } else if (action.kind === "delete") {
        runCommand("deletePages");
      } else if (action.kind === "label") {
        editPages(tabId, { kind: "label", from: action.from, to: action.to, numbering: action.numbering });
      } else {
        const selected = handles.current.get(tabId)?.selectedPages() ?? [];
        const count = selected.includes(action.page) ? selected.length : 1;
        const plural = count > 1 ? `${count} Pages` : "Page";
        showContextMenu([
          { label: `Rotate ${plural} Left`, run: () => runCommand("rotatePagesLeft") },
          { label: `Rotate ${plural} Right`, run: () => runCommand("rotatePagesRight") },
          "-",
          { label: `Extract ${plural} to New Tab`, run: () => runCommand("extractPages") },
          { label: count > 1 ? `Export ${plural} as Images…` : "Export Page as Image…", run: () => runCommand("exportSelectedPagesAsImages") },
          { label: "Insert Pages from File…", run: () => runCommand("insertPages") },
          { label: "Page Labels…", run: () => runCommand("pageLabels") },
          "-",
          { label: `Delete ${plural}`, enabled: count < (snapshotsRef.current[tabId]?.pagesCount ?? 0), run: () => runCommand("deletePages") },
        ]);
      }
    },
    [editPages],
  );

  const dropFiles = useCallback(
    (dropped: DroppedFile[], point: DropPoint | null) => {
      const opened = openedFiles(dropped);
      markdownIn(opened).forEach((source) => openSource(source));
      const files = opened.filter((file) => file.kind !== "markdown");
      const target = point && dropTargetAt(point);
      if (!files.length) {
        return;
      }
      if (target) {
        insertFiles(target.tabId, files, target.slot);
      } else {
        openFiles(files);
      }
    },
    [insertFiles, openSource],
  );

  return { runPageCommand, pageAction, stepHistory, documentLoaded, documentFailed, dropFiles, settled };
}

export type PageEditsApi = ReturnType<typeof usePageEdits>;
