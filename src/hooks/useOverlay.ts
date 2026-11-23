import { useCallback, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CommandId } from "../lib/commands";
import type { Matrix } from "../lib/contentPlacements";
import { overlayLabel, overlayName, sheetLabels, type OverlayPair } from "../lib/overlayPairs";
import { overlayColors, type OverlayColorsId, type OverlaySheet } from "../lib/overlayPlan";
import { sheetChanges } from "../lib/overlayRender";
import { WorkerStoppedError, overlayPdfsOffThread, type OverlaySource } from "../lib/pageEditWorker";
import { hasCustomLabels } from "../lib/pageLabels";
import { PasswordCancelledError, loadPdf } from "../lib/pdfjs";
import { pickPdf, showError } from "../lib/platform";
import { usePersistentState } from "../lib/preferences";
import * as ws from "../lib/workspace";
import type { PageEditsApi } from "./usePageEdits";
import type { WorkspaceApi } from "./useWorkspace";

export type OverlaySide = {
  id: string;
  name: string;
  doc: PDFDocumentProxy;
  count: number;
  labels: string[];
  labeled: boolean;
  page: number;
  tabId: string | null;
  bytes: Uint8Array | null;
};

export type OverlayRequest = { previous: OverlaySide; current: OverlaySide | null; tabs: Array<{ id: string; name: string }> };

export type OverlayChoice = { pairs: OverlayPair[]; alignment: Matrix | null; markChanges: boolean };

export type OverlayStatus = { kind: "idle" } | { kind: "working"; step: string; done: number; total: number } | { kind: "failed"; message: string };

const IDLE: OverlayStatus = { kind: "idle" };
const LOCKED = "This PDF is password protected. Open it in a tab first, then choose that tab.";

const releaseSide = (side: OverlaySide | null) => {
  if (side && !side.tabId) {
    side.doc.loadingTask.destroy();
  }
};

export function useOverlay({ workspaceRef, handles, openSource }: WorkspaceApi, { capture }: Pick<PageEditsApi, "capture">) {
  const [stored, setStored] = usePersistentState<unknown>("clumsy.overlayColors", null);
  const [request, setRequest] = useState<OverlayRequest | null>(null);
  const [status, setStatus] = useState<OverlayStatus>(IDLE);
  const run = useRef<AbortController | null>(null);
  const live = useRef<OverlayRequest | null>(null);
  const colors = overlayColors(stored);

  const show = (next: OverlayRequest | null) => {
    live.current = next;
    setRequest(next);
  };

  const tabSide = (tabId: string): OverlaySide | null => {
    const tab = workspaceRef.current.tabs[tabId];
    const viewer = handles.current.get(tabId)?.viewer;
    const doc = viewer?.pdfDocument;
    if (!tab || tab.kind !== "document" || !viewer || !doc) {
      return null;
    }
    return {
      id: tabId,
      name: tab.name,
      doc,
      count: doc.numPages,
      labels: sheetLabels(viewer.pageLabels, doc.numPages),
      labeled: hasCustomLabels(viewer.pageLabels),
      page: Math.min(doc.numPages, Math.max(1, viewer.pageNumber)) - 1,
      tabId,
      bytes: null,
    };
  };

  const openTabs = () =>
    ws.orderedTabs(workspaceRef.current).flatMap((tab) => (tab.kind === "document" && handles.current.get(tab.id)?.viewer.pdfDocument ? [{ id: tab.id, name: tab.name }] : []));

  const close = () => {
    run.current?.abort();
    run.current = null;
    releaseSide(live.current?.previous ?? null);
    releaseSide(live.current?.current ?? null);
    show(null);
    setStatus(IDLE);
  };

  const runOverlayCommand = useCallback((id: CommandId) => {
    if (id !== "overlayDrawings") {
      return false;
    }
    const previous = tabSide(ws.focusedTab(workspaceRef.current).id);
    if (previous && !live.current) {
      const tabs = openTabs();
      const others = tabs.filter((tab) => tab.id !== previous.id);
      show({ previous, current: others.length === 1 ? tabSide(others[0].id) : null, tabs });
      setStatus(IDLE);
    }
    return true;
  }, []);

  const setCurrent = (side: OverlaySide | null) => {
    const current = live.current;
    if (!current || !side) {
      releaseSide(side);
      return;
    }
    releaseSide(current.current);
    show({ ...current, current: side });
    setStatus(IDLE);
  };

  const chooseFile = async () => {
    try {
      const source = await pickPdf();
      if (!source) {
        return;
      }
      const open = source.path ? ws.orderedTabs(workspaceRef.current).find((tab) => tab.kind === "document" && tab.path === source.path) : undefined;
      const fromTab = open && open.id !== live.current?.previous.id ? tabSide(open.id) : null;
      if (fromTab) {
        setCurrent(fromTab);
        return;
      }
      const doc = await loadPdf(source.data.slice(), async () => null);
      const labels = await doc.getPageLabels().catch(() => null);
      setCurrent({
        id: `file:${crypto.randomUUID()}`,
        name: source.name,
        doc,
        count: doc.numPages,
        labels: sheetLabels(labels, doc.numPages),
        labeled: hasCustomLabels(labels),
        page: 0,
        tabId: null,
        bytes: source.data,
      });
    } catch (error) {
      await showError(error instanceof PasswordCancelledError ? LOCKED : `Could not open this file.\n\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const unchanged = (side: OverlaySide) => !side.tabId || handles.current.get(side.tabId)?.viewer.pdfDocument === side.doc;

  const sourceOf = async (side: OverlaySide): Promise<OverlaySource> => {
    if (side.bytes) {
      return { bytes: side.bytes.slice() };
    }
    const captured = side.tabId && unchanged(side) ? await capture(side.tabId) : null;
    if (!unchanged(side) || (captured && captured.version.count !== side.count)) {
      throw new Error(`“${side.name}” changed while this sheet was open. Close the sheet and start again.`);
    }
    if (!captured) {
      throw new Error(`“${side.name}” isn't ready yet. Try again in a moment.`);
    }
    return { bytes: captured.version.bytes.slice(), password: captured.version.protection?.password };
  };

  const asBuilt = (source: OverlaySource) => loadPdf(source.bytes.slice(), async () => source.password ?? null);

  const build = async ({ pairs, alignment, markChanges }: OverlayChoice) => {
    const current = live.current;
    if (!current?.current || run.current || !pairs.length) {
      return;
    }
    const { previous, current: latest } = current;
    const controller = new AbortController();
    run.current = controller;
    const stopped = () => run.current !== controller;
    setStatus({ kind: "working", step: "Reading the drawings…", done: 0, total: 0 });
    const compared: PDFDocumentProxy[] = [];
    try {
      const before = await sourceOf(previous);
      const after = await sourceOf(latest);
      if (markChanges) {
        compared.push(await asBuilt(before));
        compared.push(await asBuilt(after));
      }
      const sheets: OverlaySheet[] = [];
      for (const [index, pair] of pairs.entries()) {
        if (stopped()) {
          return;
        }
        const both = pair.previous !== null && pair.current !== null;
        if (markChanges && both) {
          setStatus({ kind: "working", step: "Looking for changes", done: index, total: pairs.length });
        }
        sheets.push({
          ...pair,
          label: overlayLabel(pair, previous.labels, latest.labels),
          alignment: both && alignment ? alignment : undefined,
          changes: markChanges && both ? await sheetChanges(compared[0], pair.previous as number, compared[1], pair.current as number, alignment) : undefined,
        });
      }
      if (stopped()) {
        return;
      }
      setStatus({ kind: "working", step: "Building sheet", done: 0, total: sheets.length });
      const data = await overlayPdfsOffThread(
        before,
        after,
        { sheets, previous: colors.previous, current: colors.current, previousName: previous.name, currentName: latest.name },
        { signal: controller.signal, onProgress: ({ done, total }) => !stopped() && setStatus({ kind: "working", step: "Building sheet", done, total }) },
      );
      if (stopped()) {
        return;
      }
      close();
      await openSource({ name: overlayName(previous.name, latest.name), path: null, data }, { carriedChanges: true });
    } catch (error) {
      if (!stopped() && !(error instanceof WorkerStoppedError)) {
        run.current = null;
        setStatus({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      compared.forEach((doc) => doc.loadingTask.destroy());
    }
  };

  return {
    runOverlayCommand,
    dialog: {
      request,
      status,
      colors: colors.id,
      onColors: (id: OverlayColorsId) => setStored(id),
      onCurrentTab: (tabId: string) => setCurrent(tabSide(tabId)),
      onChooseFile: chooseFile,
      onSwap: () => {
        const current = live.current;
        if (current?.current && !run.current) {
          show({ ...current, previous: current.current, current: current.previous });
        }
      },
      onBuild: build,
      onStop: () => {
        run.current?.abort();
        run.current = null;
        setStatus(IDLE);
      },
      onClose: close,
    },
  };
}
