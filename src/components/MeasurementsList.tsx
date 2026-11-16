import { useEffect, useMemo, useRef } from "react";
import type { Markup } from "../lib/markup";
import { measurementRows, measurementTotals } from "../lib/measurements";
import { isMobile } from "../lib/platform";

type MeasurementsListProps = {
  measurements: Markup[];
  selected: string | null;
  pageLabels: string[] | null;
  onSelect: (id: string) => void;
  onCopy: () => void;
  onExport: () => void;
};

export function MeasurementsList({ measurements, selected, pageLabels, onSelect, onCopy, onExport }: MeasurementsListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const rows = useMemo(() => measurementRows(measurements, pageLabels), [measurements, pageLabels]);
  const totals = useMemo(() => measurementTotals(rows), [rows]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!rows.length) {
    return <p className="sidebar-empty">No measurements yet. Click and drag on a page to measure a length, or click each corner to measure a path or an area.</p>;
  }
  return (
    <div className="measurements-panel">
      <div className="changes-header measurement-totals">
        {totals.map((total) => (
          <p key={total.label} className="measurement-total">
            <span>
              {total.label} <span className="measurement-count">({total.count})</span>
            </span>
            <strong>{total.value}</strong>
          </p>
        ))}
        <div className="measurement-actions">
          <button type="button" onClick={onCopy}>
            Copy
          </button>
          {!isMobile && (
            <button type="button" onClick={onExport}>
              Export CSV…
            </button>
          )}
        </div>
      </div>
      <ol className="changes measurements" ref={listRef}>
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" className="change-row measurement-row" aria-current={row.id === selected || undefined} onClick={() => onSelect(row.id)}>
              <span className="change-meta">
                <span className="change-dot" style={{ background: row.color }} />
                {row.type}
                <span className="change-page">Page {row.page}</span>
              </span>
              <span className="measurement-value">{row.value}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
