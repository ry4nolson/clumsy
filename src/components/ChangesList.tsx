import { memo, useEffect, useRef } from "react";
import type { CompareView } from "../hooks/useComparison";
import type { ChangeKind } from "../lib/comparison";

const kindLabels: Record<ChangeKind, string> = { added: "Added", removed: "Removed", modified: "Changed" };

type ChangesListProps = { view: CompareView };

const sameList = ({ view: a }: ChangesListProps, { view: b }: ChangesListProps) =>
  a.comparison === b.comparison && a.current === b.current && a.side === b.side && a.status === b.status && a.progress === b.progress && a.onSelect === b.onSelect;

export const ChangesList = memo(function ChangesList({ view }: ChangesListProps) {
  const { comparison, current, side, status, progress, onSelect } = view;
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  if (!comparison) {
    return <p className="sidebar-empty">{status === "failed" ? `Couldn't compare these documents. ${progress}` : progress || "Comparing…"}</p>;
  }
  if (!comparison.changes.length) {
    return <p className="sidebar-empty">The text of these documents is the same.</p>;
  }
  return (
    <ol className="changes" ref={listRef}>
      {comparison.changes.map((change, index) => (
        <li key={index}>
          <button
            type="button"
            data-index={index}
            className={`change-row ${change.kind}`}
            aria-current={index === current || undefined}
            onClick={() => onSelect(index)}
          >
            <span className="change-meta">
              <span className="change-dot" />
              {kindLabels[change.kind]}
              {change[side][0] && <span className="change-page">Page {change[side][0].page + 1}</span>}
            </span>
            {change.before && <del>{change.before}</del>}
            {change.after && <ins>{change.after}</ins>}
          </button>
        </li>
      ))}
    </ol>
  );
}, sameList);
