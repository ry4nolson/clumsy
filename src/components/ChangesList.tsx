import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CompareView } from "../hooks/useComparison";
import { describeWords, filteredChanges, summarizeChanges, type ChangeFilter } from "../lib/changeSummary";
import { changeKindLabels } from "../lib/comparison";

type ChangesListProps = { view: CompareView };

const filters: ChangeFilter[] = ["all", "added", "removed", "modified"];

const sameList = ({ view: a }: ChangesListProps, { view: b }: ChangesListProps) =>
  a.comparison === b.comparison && a.current === b.current && a.side === b.side && a.status === b.status && a.progress === b.progress && a.onSelect === b.onSelect;

export const ChangesList = memo(function ChangesList({ view }: ChangesListProps) {
  const { comparison, current, side, status, progress, onSelect } = view;
  const [filter, setFilter] = useState<ChangeFilter>("all");
  const listRef = useRef<HTMLOListElement>(null);
  const changes = comparison?.changes;
  const summary = useMemo(() => changes && summarizeChanges(changes), [changes]);
  const shown = useMemo(() => changes && filteredChanges(changes, filter), [changes, filter]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current, filter]);

  if (!comparison || !changes || !summary || !shown) {
    return <p className="sidebar-empty">{status === "failed" ? `Couldn't compare these documents. ${progress}` : progress || "Comparing…"}</p>;
  }
  if (!changes.length) {
    return <p className="sidebar-empty">The text of these documents is the same.</p>;
  }
  const count = (kind: ChangeFilter) => (kind === "all" ? changes.length : summary[kind]);
  return (
    <div className="changes-panel">
      <div className="changes-header">
        <div className="change-filters" role="group" aria-label="Show changes">
          {filters.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`change-filter ${kind}`}
              aria-pressed={filter === kind}
              disabled={!count(kind)}
              title={kind === "all" ? "All changes" : changeKindLabels[kind]}
              onClick={() => setFilter(kind)}
            >
              {kind === "all" ? "All" : <span className="change-dot" />}
              <span>{count(kind)}</span>
            </button>
          ))}
        </div>
        <p className="change-words" title={describeWords(summary)}>
          <span className="added">+{summary.wordsAdded.toLocaleString()}</span>
          <span className="removed">−{summary.wordsRemoved.toLocaleString()}</span>
          words
        </p>
      </div>
      <ol className="changes" ref={listRef}>
        {shown.map((index) => {
          const change = changes[index];
          return (
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
                  {changeKindLabels[change.kind]}
                  {change[side][0] && <span className="change-page">Page {change[side][0].page + 1}</span>}
                </span>
                {change.before && <del>{change.before}</del>}
                {change.after && <ins>{change.after}</ins>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}, sameList);
