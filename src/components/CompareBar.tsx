import { ArrowLeftRight, ChevronDown, ChevronUp, FileDown, Link, Unlink, X } from "lucide-react";
import type { CompareView } from "../hooks/useComparison";
import { describeWords, summarizeChanges } from "../lib/changeSummary";
import { shortcutFor, type CommandId } from "../lib/commands";
import type { Side } from "../lib/comparison";
import { usesMacKeys } from "../lib/platform";

const withShortcut = (label: string, id: CommandId) => {
  const shortcut = shortcutFor(id, usesMacKeys);
  return shortcut ? `${label} (${shortcut})` : label;
};

export type CompareBarView = {
  side: Side;
  summary: string;
  details: string;
  hasChanges: boolean;
  linked: boolean;
  linkable: boolean;
  onStep: (direction: 1 | -1) => void;
  onSwap: () => void;
  onToggleLinked: () => void;
  onEnd: () => void;
  report?: { ready: boolean; onExport: () => void };
};

export function countSummary(count: number, current: number) {
  if (!count) {
    return "No differences";
  }
  return current >= 0 ? `Change ${current + 1} of ${count}` : `${count} ${count === 1 ? "change" : "changes"}`;
}

function summary({ status, progress, comparison, current }: CompareView) {
  if (status === "comparing") {
    return progress || "Comparing…";
  }
  return status === "failed" ? "Couldn't compare" : countSummary(comparison?.changes.length ?? 0, current);
}

function details({ status, progress, comparison, otherName }: CompareView) {
  if (status === "failed") {
    return progress;
  }
  const compared = `Compared with ${otherName}`;
  return comparison?.changes.length ? `${describeWords(summarizeChanges(comparison.changes))}. ${compared}` : compared;
}

export const pdfCompareBar = (view: CompareView): CompareBarView => ({
  ...view,
  summary: summary(view),
  details: details(view),
  hasChanges: !!view.comparison?.changes.length,
  report: { ready: view.status === "ready", onExport: view.onExport },
});

export function CompareBar({ view }: { view: CompareBarView }) {
  const { hasChanges, report } = view;
  return (
    <div className={`compare-bar ${view.side}`} role="toolbar" aria-label="Comparison">
      <span className="compare-side">{view.side === "left" ? "Original" : "Changed"}</span>
      <span className="compare-summary" aria-live="polite" title={view.details}>
        {view.summary}
      </span>
      <button type="button" className="icon-button" disabled={!hasChanges} onClick={() => view.onStep(-1)} title={withShortcut("Previous change", "previousChange")}>
        <ChevronUp size={16} />
      </button>
      <button type="button" className="icon-button" disabled={!hasChanges} onClick={() => view.onStep(1)} title={withShortcut("Next change", "nextChange")}>
        <ChevronDown size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-pressed={view.linked && view.linkable}
        disabled={!view.linkable}
        onClick={view.onToggleLinked}
        title={!view.linkable ? "Linked scrolling needs vertical or wrapped scrolling on both sides" : view.linked ? "Unlink scrolling" : "Link scrolling"}
      >
        {view.linked && view.linkable ? <Link size={15} /> : <Unlink size={15} />}
      </button>
      <button type="button" className="icon-button" onClick={view.onSwap} title="Swap sides">
        <ArrowLeftRight size={15} />
      </button>
      {report && (
        <button type="button" className="icon-button" disabled={!report.ready} onClick={report.onExport} title="Export comparison report">
          <FileDown size={15} />
        </button>
      )}
      <button type="button" className="icon-button" onClick={view.onEnd} title="End comparison">
        <X size={16} />
      </button>
    </div>
  );
}
