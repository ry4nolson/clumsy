import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countSummary, type CompareBarView } from "../components/CompareBar";
import { otherSide, type Side } from "../lib/comparison";
import type { DiffStatus, SourceComparison } from "../lib/markdownDiff";
import { showError } from "../lib/platform";
import type { LineChange } from "../lib/markdownMap";
import { describeLines, sideChanges } from "../lib/sourceDiff";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

type MarkdownComparisonState = {
  tabs: Record<Side, string>;
  status: DiffStatus | null;
  linked: boolean;
};

export type MarkdownCompareView = CompareBarView & { changes: readonly LineChange[] | null };

const sides: Side[] = ["left", "right"];

export function useMarkdownComparison({ workspace, markdownHandles, markdownSnapshots }: WorkspaceApi) {
  const [state, setState] = useState<MarkdownComparisonState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const controller = useRef<SourceComparison | null>(null);

  const leftId = state?.tabs.left;
  const rightId = state?.tabs.right;
  const loaded = !!(leftId && rightId && markdownSnapshots[leftId]?.loaded && markdownSnapshots[rightId]?.loaded);
  const linked = !!state?.linked;
  const status = state?.status;
  const changes = useMemo(() => status && { left: sideChanges(status.chunks, "left", status.current), right: sideChanges(status.chunks, "right", status.current) }, [status]);

  useEffect(() => {
    const left = leftId && markdownHandles.current.get(leftId);
    const right = rightId && markdownHandles.current.get(rightId);
    if (!loaded || !left || !right) {
      return;
    }
    let cancelled = false;
    let made: SourceComparison | null = null;
    Promise.all([left.showSource(false), right.showSource(false), import("../lib/markdownDiff")])
      .then(([leftEditor, rightEditor, { createSourceComparison }]) => {
        if (cancelled) {
          return;
        }
        made = createSourceComparison({ left: leftEditor, right: rightEditor }, (status) => setState((previous) => previous && { ...previous, status }));
        made.setLinked(!!stateRef.current?.linked);
        controller.current = made;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState(null);
          showError(`Could not compare these files.\n\n${error instanceof Error ? error.message : String(error)}`);
        }
      });
    return () => {
      cancelled = true;
      made?.destroy();
      if (controller.current === made) {
        controller.current = null;
      }
    };
  }, [leftId, rightId, loaded, markdownHandles]);

  useEffect(() => {
    controller.current?.setLinked(linked);
  }, [linked]);

  useEffect(() => {
    if (!state) {
      return;
    }
    const panes = sides.map((side) => (workspace.tabs[state.tabs[side]]?.kind === "markdown" ? ws.paneOfTab(workspace, state.tabs[side]) : null));
    if (!panes[0] || !panes[1] || panes[0] === panes[1]) {
      setState(null);
    }
  }, [workspace, state]);

  const start = useCallback((left: string, right: string) => {
    const latest = stateRef.current;
    if (latest?.tabs.left !== left || latest.tabs.right !== right) {
      setState({ tabs: { left, right }, status: null, linked: true });
    }
  }, []);

  const end = useCallback(() => setState(null), []);

  const step = useCallback((direction: 1 | -1) => controller.current?.step(direction), []);

  const swap = useCallback(() => setState((previous) => previous && { ...previous, status: null, tabs: { left: previous.tabs.right, right: previous.tabs.left } }), []);
  const toggleLinked = useCallback(() => setState((previous) => previous && { ...previous, linked: !previous.linked }), []);

  const viewFor = (tabId: string): MarkdownCompareView | null => {
    const side = state && sides.find((candidate) => state.tabs[candidate] === tabId);
    if (!state || !side) {
      return null;
    }
    const { status } = state;
    const other = workspace.tabs[state.tabs[otherSide(side)]];
    const compared = `Compared with ${other?.kind === "markdown" ? other.name : ""}`;
    const totals = status && describeLines(status);
    return {
      side,
      summary: status ? countSummary(status.count, status.current) : "Comparing…",
      details: totals ? `${totals}. ${compared}` : compared,
      hasChanges: !!status?.count,
      linked: state.linked,
      linkable: true,
      onStep: step,
      onSwap: swap,
      onToggleLinked: toggleLinked,
      onEnd: end,
      changes: changes?.[side] ?? null,
    };
  };

  return { active: !!state, start, end, step, swap, toggleLinked, viewFor };
}
