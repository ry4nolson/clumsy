import { useCallback, useRef } from "react";
import type { PageAction } from "../components/DocumentTab";
import type { CommandId } from "../lib/commands";
import {
  applyPageEdit,
  combinePdfs,
  countAfterEdit,
  extractPages,
  pageAfterEdit,
  pageCount,
  pageRanges,
  selectionAfterEdit,
  type PageEdit,
} from "../lib/pageEdits";
import { pickPdf, pickPdfs, showContextMenu, showError, type DropPoint, type PdfSource } from "../lib/platform";
import { slotAt } from "../components/Thumbnails";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

const HISTORY_LIMIT = 20;

type Version = { bytes: Uint8Array; page: number; count: number };
type History = { undo: Version[]; redo: Version[] };
type DropTarget = { tabId: string; slot: number };

const baseName = (name: string) => name.replace(/\.pdf$/i, "");

export function dropTargetAt(point: DropPoint): DropTarget | null {
  const element = document.elementFromPoint(point.x, point.y);
  const thumbnails = element?.closest<HTMLElement>(".thumbnails");
  const tabId = thumbnails?.closest<HTMLElement>(".document-tab:not(.inactive)")?.dataset.tabId;
  return thumbnails && tabId ? { tabId, slot: slotAt(thumbnails, point.y) } : null;
}

export function showDropTarget(target: DropTarget | null) {
  document.querySelectorAll("[data-drop-target], [data-drop-slot]").forEach((element) => {
    element.removeAttribute("data-drop-target");
    element.removeAttribute("data-drop-slot");
  });
  if (!target) {
    return;
  }
  const container = document.querySelector(`.document-tab[data-tab-id="${target.tabId}"] .thumbnails`);
  container?.setAttribute("data-drop-target", "");
  const thumbnails = container?.querySelectorAll(".thumbnail");
  const marked = thumbnails?.[target.slot] ?? thumbnails?.[thumbnails.length - 1];
  marked?.setAttribute("data-drop-slot", target.slot < (thumbnails?.length ?? 0) ? "before" : "after");
}

const report = (error: unknown) => showError(`Couldn't change pages.\n\n${error instanceof Error ? error.message : String(error)}`);

export function usePageEdits({ workspaceRef, snapshotsRef, handles, update, openSource }: WorkspaceApi) {
  const histories = useRef(new Map<string, History>());
  const pending = useRef(new Map<string, Version>());
  const queues = useRef(new Map<string, Promise<unknown>>());

  const historyFor = (tabId: string) => {
    for (const id of histories.current.keys()) {
      if (!workspaceRef.current.tabs[id]) {
        histories.current.delete(id);
      }
    }
    const existing = histories.current.get(tabId) ?? { undo: [], redo: [] };
    histories.current.set(tabId, existing);
    return existing;
  };

  const enqueue = useCallback((tabId: string, task: () => Promise<void>) => {
    const next = (queues.current.get(tabId) ?? Promise.resolve()).then(task).catch(report);
    queues.current.set(tabId, next);
    next.finally(() => {
      if (queues.current.get(tabId) === next) {
        queues.current.delete(tabId);
      }
    });
    return next;
  }, []);

  const currentVersion = async (tabId: string): Promise<Version | null> => {
    const waiting = pending.current.get(tabId);
    if (waiting) {
      return { ...waiting, bytes: waiting.bytes.slice() };
    }
    const handle = handles.current.get(tabId);
    const snapshot = snapshotsRef.current[tabId];
    if (!handle || !snapshot?.loaded) {
      return null;
    }
    const bytes = await handle.viewer.save();
    return bytes ? { bytes, page: snapshot.pageNumber - 1, count: snapshot.pagesCount } : null;
  };

  const show = (tabId: string, version: Version, selection: number[]) => {
    pending.current.set(tabId, { ...version, bytes: version.bytes.slice() });
    const previous = handles.current.get(tabId)?.viewer.viewState();
    const page = Math.min(Math.max(0, selection[0] ?? version.page), version.count - 1);
    update((current) => {
      const tab = current.tabs[tabId];
      if (tab?.kind !== "document") {
        return current;
      }
      const samePage = previous?.page === page + 1;
      const view = {
        page: page + 1,
        scaleValue: previous?.scaleValue ?? "page-width",
        left: samePage ? previous.left : null,
        top: samePage ? previous.top : null,
        rotation: previous?.rotation ?? 0,
      };
      return ws.replaceTab(current, { ...tab, source: { ...tab.source, data: version.bytes }, carriedChanges: true, view, selection });
    });
  };

  const performEdit = async (tabId: string, edit: PageEdit) => {
    const before = await currentVersion(tabId);
    if (!before) {
      return;
    }
    const inserted = edit.kind === "insert" ? await pageCount(edit.data) : 0;
    const bytes = await applyPageEdit(before.bytes, edit);
    const history = historyFor(tabId);
    history.undo = [...history.undo, before].slice(-HISTORY_LIMIT);
    history.redo = [];
    const page = pageAfterEdit(edit, before.page, before.count, inserted);
    show(tabId, { bytes, page, count: countAfterEdit(edit, before.count, inserted) }, selectionAfterEdit(edit, before.count, inserted));
  };

  const editPages = useCallback((tabId: string, edit: PageEdit) => enqueue(tabId, () => performEdit(tabId, edit)), [enqueue]);

  const documentLoaded = useCallback((tabId: string) => {
    pending.current.delete(tabId);
  }, []);

  const stepHistory = useCallback(
    (direction: "undo" | "redo") => {
      const tab = ws.focusedTab(workspaceRef.current);
      const history = histories.current.get(tab.id);
      const snapshot = snapshotsRef.current[tab.id];
      if (!history?.[direction].length || (snapshot?.modified && !pending.current.has(tab.id))) {
        return false;
      }
      enqueue(tab.id, async () => {
        const target = history[direction].pop();
        const current = target && (await currentVersion(tab.id));
        if (!target || !current) {
          return;
        }
        history[direction === "undo" ? "redo" : "undo"].push(current);
        show(tab.id, target, []);
      });
      return true;
    },
    [enqueue],
  );

  const insertSources = useCallback(
    (tabId: string, sources: Array<Promise<PdfSource | null>>, at: number) =>
      enqueue(tabId, async () => {
        const files = (await Promise.all(sources)).filter((source): source is PdfSource => !!source);
        if (!files.length) {
          return;
        }
        const data = files.length === 1 ? files[0].data : await combinePdfs(files.map((file) => file.data));
        await performEdit(tabId, { kind: "insert", data, at });
      }),
    [enqueue],
  );

  const runPageCommand = useCallback(
    (id: CommandId) => {
      const tab = ws.focusedTab(workspaceRef.current);
      const handle = handles.current.get(tab.id);
      if (id === "combineFiles") {
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
        return true;
      }
      if (tab.kind !== "document" || !handle) {
        return false;
      }
      const pages = handle.selectedPages();
      const actions: Partial<Record<CommandId, () => unknown>> = {
        rotatePagesLeft: () => editPages(tab.id, { kind: "rotate", pages, by: -90 }),
        rotatePagesRight: () => editPages(tab.id, { kind: "rotate", pages, by: 90 }),
        deletePages: () => editPages(tab.id, { kind: "delete", pages }),
        insertPages: () => insertSources(tab.id, [pickPdf()], Math.max(...pages) + 1),
        extractPages: () =>
          enqueue(tab.id, async () => {
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
    [editPages, enqueue, insertSources, openSource],
  );

  const pageAction = useCallback(
    (tabId: string, action: PageAction, runCommand: (id: CommandId) => void) => {
      if (action.kind === "move") {
        editPages(tabId, { kind: "move", pages: action.pages, to: action.slot });
      } else if (action.kind === "delete") {
        runCommand("deletePages");
      } else {
        const count = handles.current.get(tabId)?.selectedPages().length ?? 1;
        const plural = count > 1 ? `${count} Pages` : "Page";
        showContextMenu([
          { label: `Rotate ${plural} Left`, run: () => runCommand("rotatePagesLeft") },
          { label: `Rotate ${plural} Right`, run: () => runCommand("rotatePagesRight") },
          "-",
          { label: `Extract ${plural} to New Tab`, run: () => runCommand("extractPages") },
          { label: "Insert Pages from File…", run: () => runCommand("insertPages") },
          "-",
          { label: `Delete ${plural}`, enabled: count < (snapshotsRef.current[tabId]?.pagesCount ?? 0), run: () => runCommand("deletePages") },
        ]);
      }
    },
    [editPages],
  );

  const dropFiles = useCallback(
    (sources: Array<Promise<PdfSource>>, point: DropPoint | null) => {
      const target = point && dropTargetAt(point);
      if (!target) {
        return false;
      }
      insertSources(target.tabId, sources, target.slot);
      return true;
    },
    [insertSources],
  );

  return { runPageCommand, pageAction, stepHistory, documentLoaded, dropFiles };
}
