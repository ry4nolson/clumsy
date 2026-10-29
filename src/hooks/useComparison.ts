import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommandId } from "../lib/commands";
import { buildComparison, changeRect, otherSide, overlaysFor, type Comparison, type Side } from "../lib/comparison";
import { tokenPage } from "../lib/diffTokens";
import { diffInWorker } from "../lib/diffWorker";
import { documentText } from "../lib/pdfText";
import { pickPdf, showError, type PdfSource } from "../lib/platform";
import { syncLocation } from "../lib/scrollSync";
import { createPaneId, type DocTab } from "../lib/tabs";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

export type CompareStatus = "comparing" | "ready" | "failed";

type ComparisonState = {
  tabs: Record<Side, string>;
  status: CompareStatus;
  progress: string;
  result: Comparison | null;
  current: number;
  linked: boolean;
};

export type CompareView = Omit<ComparisonState, "tabs" | "result"> & {
  comparison: Comparison | null;
  side: Side;
  otherName: string;
  onSelect: (index: number) => void;
  onStep: (direction: 1 | -1) => void;
  onSwap: () => void;
  onToggleLinked: () => void;
  onEnd: () => void;
};

const sides: Side[] = ["left", "right"];

export function useComparison({ workspace, snapshots, workspaceRef, handles, update, openSource }: WorkspaceApi, onStart: () => void) {
  const [state, setState] = useState<ComparisonState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  const expected = useRef<Record<Side, number | null>>({ left: null, right: null });

  const docTab = (id: string | undefined) => {
    const tab = id ? workspace.tabs[id] : undefined;
    return tab?.kind === "document" ? tab : null;
  };
  const leftId = state?.tabs.left;
  const rightId = state?.tabs.right;
  const leftSource = docTab(leftId)?.source;
  const rightSource = docTab(rightId)?.source;
  const leftLoaded = !!(leftId && snapshots[leftId]?.loaded);
  const rightLoaded = !!(rightId && snapshots[rightId]?.loaded);
  const result = state?.result ?? null;
  const current = state?.current ?? -1;
  const linked = !!state?.linked;

  const patch = useCallback((change: Partial<ComparisonState>) => setState((previous) => previous && { ...previous, ...change }), []);

  useEffect(() => {
    const left = leftId && handles.current.get(leftId)?.viewer.pdfDocument;
    const right = rightId && handles.current.get(rightId)?.viewer.pdfDocument;
    if (!leftLoaded || !rightLoaded || !left || !right) {
      return;
    }
    const controller = new AbortController();
    const total = left.numPages + right.numPages;
    const read = { left: 0, right: 0 };
    const progress = (side: Side) => (page: number) => {
      read[side] = page;
      const done = read.left + read.right;
      if (!controller.signal.aborted && (done % 10 === 0 || done === total)) {
        patch({ progress: `Reading pages… ${done} of ${total}` });
      }
    };
    patch({ status: "comparing", progress: "Reading pages…", result: null, current: -1 });
    Promise.all([documentText(left, progress("left")), documentText(right, progress("right"))])
      .then(async ([a, b]) => {
        controller.signal.throwIfAborted();
        patch({ progress: "Comparing…" });
        const request = { left: a.tokens.map((token) => token.text), right: b.tokens.map((token) => token.text), leftPages: a.tokens.map(tokenPage), rightPages: b.tokens.map(tokenPage) };
        const segments = await diffInWorker(request, controller.signal);
        return buildComparison(a.tokens, b.tokens, segments, { left: a.pages, right: b.pages });
      })
      .then((comparison) => {
        if (!controller.signal.aborted) {
          patch({ status: "ready", progress: "", result: comparison });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          patch({ status: "failed", progress: error instanceof Error ? error.message : String(error) });
        }
      });
    return () => controller.abort();
  }, [leftId, rightId, leftSource, rightSource, leftLoaded, rightLoaded, handles, patch]);

  useEffect(() => {
    if (!state) {
      return;
    }
    const leftPane = ws.paneOfTab(workspace, state.tabs.left);
    const rightPane = ws.paneOfTab(workspace, state.tabs.right);
    if (!docTab(state.tabs.left) || !docTab(state.tabs.right) || !leftPane || !rightPane || leftPane === rightPane) {
      setState(null);
    }
  }, [workspace, state]);

  const overlays = useMemo(() => result && { left: overlaysFor(result, "left"), right: overlaysFor(result, "right") }, [result]);

  useEffect(() => {
    if (!leftId || !rightId || !overlays) {
      return;
    }
    const ids = { left: leftId, right: rightId };
    sides.forEach((side) => handles.current.get(ids[side])?.viewer.setDiffOverlays(overlays[side]));
    return () => sides.forEach((side) => handles.current.get(ids[side])?.viewer.setDiffOverlays(null));
  }, [leftId, rightId, overlays, leftLoaded, rightLoaded, handles]);

  useEffect(() => {
    [leftId, rightId].forEach((id) => id && handles.current.get(id)?.viewer.setCurrentChange(current));
  }, [leftId, rightId, current, overlays, handles]);

  useEffect(() => {
    if (!leftId || !rightId || !linked || !result) {
      return;
    }
    const ids = { left: leftId, right: rightId };
    const visible = (id: string) => ws.paneOfTab(workspaceRef.current, id)?.activeTabId === id;
    const cleanups = sides.map((from) => {
      const to = otherSide(from);
      const container = handles.current.get(ids[from])?.viewer.containerRef.current;
      let lastTop = container?.scrollTop;
      const onScroll = () => {
        const waiting = expected.current[from];
        expected.current[from] = null;
        const moved = container?.scrollTop !== lastTop;
        lastTop = container?.scrollTop;
        if (!container || !moved || (waiting !== null && Math.abs(container.scrollTop - waiting) < 2) || !visible(ids.left) || !visible(ids.right)) {
          return;
        }
        const source = handles.current.get(ids[from])?.viewer;
        const target = handles.current.get(ids[to])?.viewer;
        const location = source?.scrollPosition();
        if (!source || !target || !location) {
          return;
        }
        const rotation = { [from]: source.rotation(), [to]: target.rotation() } as Record<Side, number>;
        const before = target.containerRef.current?.scrollTop;
        const after = target.scrollTo(syncLocation(result.anchors, from, location, rotation, result.notes[to].length));
        if (after !== null && after !== before) {
          expected.current[to] = after;
        }
      };
      container?.addEventListener("scroll", onScroll, { passive: true });
      return () => container?.removeEventListener("scroll", onScroll);
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [leftId, rightId, linked, result, handles, workspaceRef]);

  const start = useCallback((left: string, right: string) => {
    const latest = stateRef.current;
    onStartRef.current();
    if (latest?.tabs.left === left && latest.tabs.right === right) {
      return;
    }
    expected.current = { left: null, right: null };
    setState({ tabs: { left, right }, status: "comparing", progress: "Reading pages…", result: null, current: -1, linked: true });
  }, []);

  const end = useCallback(() => setState(null), []);

  const goTo = useCallback(
    (index: number) => {
      const latest = stateRef.current;
      const change = latest?.result?.changes[index];
      if (!latest || !change) {
        return;
      }
      patch({ current: index });
      for (const side of sides) {
        const viewer = handles.current.get(latest.tabs[side])?.viewer;
        const rect = changeRect(change, side);
        const before = viewer?.containerRef.current?.scrollTop;
        const after = viewer && rect ? viewer.reveal(rect) : null;
        if (after !== null && after !== before) {
          expected.current[side] = after;
        }
      }
    },
    [handles, patch],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      const latest = stateRef.current;
      const count = latest?.result?.changes.length;
      if (latest && count) {
        goTo(latest.current < 0 ? (direction > 0 ? 0 : count - 1) : (latest.current + direction + count) % count);
      }
    },
    [goTo],
  );

  const swap = useCallback(() => setState((previous) => previous && { ...previous, tabs: { left: previous.tabs.right, right: previous.tabs.left } }), []);
  const toggleLinked = useCallback(() => setState((previous) => previous && { ...previous, linked: !previous.linked }), []);

  const openBeside = async (left: DocTab, source: PdfSource) => {
    const existing = ws.orderedTabs(workspaceRef.current).find((tab) => tab.kind === "document" && tab.path && tab.path === source.path && tab.id !== left.id);
    if (existing) {
      return existing.id;
    }
    const current = workspaceRef.current;
    const index = current.panes.findIndex((pane) => pane.tabIds.includes(left.id));
    const target = current.panes[index + 1] ?? (current.panes.length >= ws.MAX_PANES ? current.panes[index - 1] : undefined);
    if (target) {
      update((latest) => ws.focusPane(latest, target.id));
    }
    return openSource(source, { split: !target, allowDuplicate: !!source.path && source.path === left.path });
  };

  const compareWithFile = async () => {
    const left = ws.focusedTab(workspaceRef.current);
    if (left.kind !== "document") {
      return;
    }
    let source: PdfSource | null;
    try {
      source = await pickPdf();
    } catch (error) {
      await showError(`Could not open this PDF.\n\n${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const rightId = source && (await openBeside(left, source));
    if (source && !rightId) {
      showError(`“${source.name}” is open in another window. Move its tab into this window to compare it.`);
    }
    if (!rightId || !workspaceRef.current.tabs[left.id]) {
      return;
    }
    update((latest) => {
      const leftPane = ws.paneOfTab(latest, left.id)!;
      const index = latest.panes.indexOf(leftPane);
      const neighbor = latest.panes[index + 1] ?? latest.panes[index - 1];
      const target = latest.panes.length < ws.MAX_PANES || !neighbor ? { newPaneAfter: leftPane.id, paneId: createPaneId() } : { paneId: neighbor.id };
      const moved = ws.paneOfTab(latest, rightId) === leftPane ? ws.moveTab(latest, rightId, target) : latest;
      return ws.selectTab(ws.selectTab(moved, rightId), left.id);
    });
    start(left.id, rightId);
  };

  const compareSplitPanes = () => {
    const { panes, tabs, focusedPaneId } = workspaceRef.current;
    const index = panes.findIndex((pane) => pane.id === focusedPaneId);
    const [leftPane, rightPane] = panes[index + 1] ? [panes[index], panes[index + 1]] : [panes[index - 1], panes[index]];
    const left = leftPane && tabs[leftPane.activeTabId];
    const right = rightPane && tabs[rightPane.activeTabId];
    if (left?.kind !== "document" || right?.kind !== "document") {
      showError("Open a PDF in both panes to compare them.");
      return;
    }
    start(left.id, right.id);
  };

  const runCompareCommand = (id: CommandId) => {
    const actions: Partial<Record<CommandId, () => unknown>> = {
      compareWithFile,
      compareSplitPanes,
      nextChange: () => step(1),
      previousChange: () => step(-1),
      swapComparison: swap,
      toggleLinkedScroll: toggleLinked,
      endComparison: end,
    };
    const action = actions[id];
    action?.();
    return !!action;
  };

  const viewFor = (tabId: string): CompareView | null => {
    const side = state && sides.find((candidate) => state.tabs[candidate] === tabId);
    if (!state || !side) {
      return null;
    }
    const { tabs, result: comparison, ...rest } = state;
    const other = docTab(tabs[otherSide(side)]);
    return { ...rest, comparison, side, otherName: other?.name ?? "", onSelect: goTo, onStep: step, onSwap: swap, onToggleLinked: toggleLinked, onEnd: end };
  };

  return { comparing: !!state, runCompareCommand, viewFor };
}
