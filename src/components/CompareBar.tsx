import { ArrowLeftRight, ChevronDown, ChevronUp, FileDown, Link, Unlink, X } from "lucide-react";
import type { CompareView } from "../hooks/useComparison";
import { describeWords, summarizeChanges } from "../lib/changeSummary";
import { shortcutFor, type CommandId } from "../lib/commands";
import { isMac } from "../lib/platform";

const withShortcut = (label: string, id: CommandId) => {
  const shortcut = shortcutFor(id, isMac);
  return shortcut ? `${label} (${shortcut})` : label;
};

function summary({ status, progress, comparison, current }: CompareView) {
  const count = comparison?.changes.length ?? 0;
  if (status === "comparing") {
    return progress || "Comparing…";
  }
  if (status === "failed") {
    return "Couldn't compare";
  }
  if (!count) {
    return "No differences";
  }
  return current >= 0 ? `Change ${current + 1} of ${count}` : `${count} ${count === 1 ? "change" : "changes"}`;
}

function details({ status, progress, comparison, otherName }: CompareView) {
  if (status === "failed") {
    return progress;
  }
  const compared = `Compared with ${otherName}`;
  return comparison?.changes.length ? `${describeWords(summarizeChanges(comparison.changes))}. ${compared}` : compared;
}

export function CompareBar({ view }: { view: CompareView }) {
  const hasChanges = !!view.comparison?.changes.length;
  return (
    <div className={`compare-bar ${view.side}`} role="toolbar" aria-label="Comparison">
      <span className="compare-side">{view.side === "left" ? "Original" : "Changed"}</span>
      <span className="compare-summary" aria-live="polite" title={details(view)}>
        {summary(view)}
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
      <button type="button" className="icon-button" disabled={view.status !== "ready"} onClick={view.onExport} title="Export comparison report">
        <FileDown size={15} />
      </button>
      <button type="button" className="icon-button" onClick={view.onEnd} title="End comparison">
        <X size={16} />
      </button>
    </div>
  );
}
