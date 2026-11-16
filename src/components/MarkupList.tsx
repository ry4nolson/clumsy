import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useMarkupRows } from "../hooks/useMarkupRows";
import { AUTHOR_NAME_KEY } from "../lib/authorName";
import type { CommandId } from "../lib/commands";
import type { MarkupList as ListController } from "../lib/markupList";
import { reviewStatuses, rowTotals, type MarkupRow, type ReviewStatus, type RowGroup } from "../lib/markupRows";
import { isMobile } from "../lib/platform";
import { usePersistentState } from "../lib/preferences";
import { MarkupFilters } from "./MarkupFilters";

type MarkupListProps = {
  list: ListController | null;
  version: number;
  visible: boolean;
  pageLabels: string[] | null;
  currentPage: number;
  pageCount: number;
  onCommand: (id: CommandId) => void;
};

const ROW_LIMIT = 400;

type Item = { group: RowGroup; row: null } | { group: RowGroup; row: MarkupRow };

const totalsText = (group: RowGroup) => group.totals.map((total) => total.value).join(" · ");

export function MarkupList({ list, version, visible, pageLabels, currentPage, pageCount, onCommand }: MarkupListProps) {
  const { rows, shown, groups, filter, setFilter, view, setView } = useMarkupRows(list, version, visible, pageLabels);
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(ROW_LIMIT);
  const [author, setAuthor] = usePersistentState(AUTHOR_NAME_KEY, "");

  useEffect(() => setLimit(ROW_LIMIT), [shown]);

  const items = useMemo(() => {
    const flat: Item[] = [];
    for (const group of groups ?? []) {
      if (view.group !== "none") {
        flat.push({ group, row: null });
      }
      if (!collapsed.has(group.key)) {
        flat.push(...group.rows.map((row) => ({ group, row })));
      }
    }
    return flat;
  }, [groups, collapsed, view.group]);

  if (!rows || !shown || !groups) {
    return <p className="sidebar-empty">Reading markup…</p>;
  }
  if (!rows.length) {
    return <p className="sidebar-empty">No markup yet. Shapes, stamps, measurements, highlights, and notes appear here as you add them.</p>;
  }

  const ordered = shown.map((row) => row.id);
  const chosen = shown.filter((row) => selected.includes(row.id));
  const totals = rowTotals(shown);

  const click = (row: MarkupRow, event: MouseEvent) => {
    if (event.shiftKey && anchor && ordered.includes(anchor)) {
      const [from, to] = [ordered.indexOf(anchor), ordered.indexOf(row.id)].sort((a, b) => a - b);
      setSelected(ordered.slice(from, to + 1));
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      setSelected((last) => (last.includes(row.id) ? last.filter((id) => id !== row.id) : [...last, row.id]));
      setAnchor(row.id);
      return;
    }
    setSelected([row.id]);
    setAnchor(row.id);
    list?.show(row);
  };

  const toggle = (key: string) =>
    setCollapsed((last) => {
      const next = new Set(last);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });

  return (
    <div className="markups-panel">
      <MarkupFilters
        rows={rows}
        filter={filter}
        onFilter={setFilter}
        group={view.group}
        sort={view.sort}
        descending={view.descending}
        onView={(patch) => setView({ ...view, ...patch })}
        currentPage={currentPage}
        pageCount={pageCount}
      />
      <div className="changes-header measurement-totals">
        <p className="measurement-total">
          <span>Shown</span>
          <strong>{shown.length === rows.length ? shown.length : `${shown.length} of ${rows.length}`}</strong>
        </p>
        {totals.map((total) => (
          <p key={total.label} className="measurement-total">
            <span>
              {total.label} <span className="measurement-count">({total.count})</span>
            </span>
            <strong>{total.value}</strong>
          </p>
        ))}
        <div className="measurement-actions">
          <button type="button" onClick={() => onCommand("copyMarkups")}>
            Copy
          </button>
          <button type="button" onClick={() => onCommand("copyMarkupSummary")}>
            Copy Summary
          </button>
          {!isMobile && (
            <>
              <button type="button" onClick={() => onCommand("exportMarkups")}>
                Export CSV…
              </button>
              <button type="button" onClick={() => onCommand("exportMarkupSummary")}>
                Export Summary…
              </button>
            </>
          )}
        </div>
        <label className="markup-author">
          <span>Your name</span>
          <input type="text" placeholder="Written on new markup" value={author} onChange={(event) => setAuthor(event.target.value)} />
        </label>
      </div>
      {chosen.length > 1 && (
        <div className="markup-selection">
          <span>{chosen.length} selected</span>
          <SelectionActions list={list} rows={chosen} />
        </div>
      )}
      {chosen.length === 1 && <SelectionActions list={list} rows={chosen} />}
      <ol className="changes markups">
        {items.slice(0, limit).map((item) =>
          item.row ? (
            <li key={item.row.id}>
              <button type="button" className="change-row markup-row" aria-current={selected.includes(item.row.id) || undefined} onClick={(event) => click(item.row!, event)}>
                <span className="change-meta">
                  <span className="change-dot" style={{ background: item.row.color ?? "transparent" }} />
                  <span className="markup-subject">{item.row.subject}</span>
                  <span className="change-page">Page {item.row.page}</span>
                </span>
                {(item.row.measure || item.row.status || item.row.subject !== item.row.type) && (
                  <span className="markup-facts">
                    {item.row.measure && <span className="measurement-value">{item.row.measure.value}</span>}
                    {item.row.subject !== item.row.type && <span className="markup-type">{item.row.type}</span>}
                    {item.row.status && item.row.status !== "None" && <span className={`markup-status ${item.row.status.toLowerCase()}`}>{item.row.status}</span>}
                  </span>
                )}
                {(item.row.author || item.row.comment) && <span className="markup-note">{[item.row.author, item.row.comment].filter(Boolean).join(" · ")}</span>}
              </button>
            </li>
          ) : (
            <li key={`group:${item.group.key}`} className="markup-group">
              <button type="button" aria-expanded={!collapsed.has(item.group.key)} onClick={() => toggle(item.group.key)}>
                <span className="markup-group-label">
                  {item.group.label} <span className="measurement-count">({item.group.rows.length})</span>
                </span>
                {item.group.totals.length > 0 && <strong>{totalsText(item.group)}</strong>}
              </button>
            </li>
          ),
        )}
      </ol>
      {items.length > limit && (
        <button type="button" className="changes-more" onClick={() => setLimit((last) => last + ROW_LIMIT)}>
          Show {Math.min(items.length - limit, ROW_LIMIT)} more of {items.length - limit}
        </button>
      )}
    </div>
  );
}

function SelectionActions({ list, rows }: { list: ListController | null; rows: MarkupRow[] }) {
  const statusable = rows.filter((row) => list?.canSetStatus(row));
  const removable = rows.filter((row) => list?.canRemove(row));
  return (
    <div className="markup-selection-actions">
      <label className="markup-filter">
        <span>Status</span>
        <select value="" aria-label="Set status" disabled={!statusable.length} onChange={(event) => event.target.value && list?.setStatus(statusable, event.target.value as ReviewStatus)}>
          <option value="">Set…</option>
          {reviewStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!removable.length} onClick={() => list?.remove(removable)}>
        Delete
      </button>
    </div>
  );
}
