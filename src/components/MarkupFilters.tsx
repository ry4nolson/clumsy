import { useMemo, useState } from "react";
import { reviewStatuses, type GroupBy, type MarkupRow, type RowFilter, type SortKey } from "../lib/markupRows";
import { parsePageRange } from "../lib/pageRanges";

type FiltersProps = {
  rows: MarkupRow[];
  filter: RowFilter;
  onFilter: (filter: RowFilter) => void;
  group: GroupBy;
  sort: SortKey;
  descending: boolean;
  onView: (patch: { group?: GroupBy; sort?: SortKey; descending?: boolean }) => void;
  currentPage: number;
  pageCount: number;
};

const sortLabels: Record<SortKey, string> = { page: "Page", subject: "Subject", type: "Type", author: "Author", date: "Date", status: "Status", value: "Value" };
const groupLabels: Record<GroupBy, string> = { subject: "Subject", page: "Page", none: "None" };

const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));

function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="markup-filter">
      <span>{label}</span>
      <select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MarkupFilters({ rows, filter, onFilter, group, sort, descending, onView, currentPage, pageCount }: FiltersProps) {
  const [pages, setPages] = useState("");
  const options = useMemo(
    () => ({ types: distinct(rows.map((row) => row.type)), subjects: distinct(rows.map((row) => row.subject.trim())), authors: distinct(rows.map((row) => row.author)) }),
    [rows],
  );
  const active = [filter.types, filter.subjects, filter.authors, filter.statuses].filter((list) => list.length).length + (filter.pages ? 1 : 0);
  const pick = (key: "types" | "subjects" | "authors" | "statuses") => (value: string) => onFilter({ ...filter, [key]: value ? [value] : [] });
  const setRange = (text: string) => {
    setPages(text);
    onFilter({ ...filter, pages: text.trim() ? (parsePageRange(text, pageCount) ?? []) : null });
  };

  return (
    <div className="markup-filters">
      <input type="search" className="markup-search" placeholder="Search subjects and comments" aria-label="Search markups" value={filter.text} onChange={(event) => onFilter({ ...filter, text: event.target.value })} />
      <details className="markup-filter-details">
        <summary>
          Filter and sort{active ? ` (${active})` : ""}
        </summary>
        <div className="markup-filter-grid">
          <label className="markup-filter">
            <span>Group by</span>
            <select value={group} aria-label="Group by" onChange={(event) => onView({ group: event.target.value as GroupBy })}>
              {Object.entries(groupLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="markup-filter">
            <span>Sort by</span>
            <select value={`${sort}${descending ? "-desc" : ""}`} aria-label="Sort by" onChange={(event) => onView({ sort: event.target.value.replace("-desc", "") as SortKey, descending: event.target.value.endsWith("-desc") })}>
              {Object.entries(sortLabels).flatMap(([key, label]) => [
                <option key={key} value={key}>
                  {label}
                </option>,
                <option key={`${key}-desc`} value={`${key}-desc`}>
                  {label}, reversed
                </option>,
              ])}
            </select>
          </label>
          <Choice label="Type" value={filter.types[0] ?? ""} options={options.types} onChange={pick("types")} />
          <Choice label="Subject" value={filter.subjects[0] ?? ""} options={options.subjects} onChange={pick("subjects")} />
          <Choice label="Author" value={filter.authors[0] ?? ""} options={options.authors} onChange={pick("authors")} />
          <Choice label="Status" value={filter.statuses[0] ?? ""} options={reviewStatuses} onChange={pick("statuses")} />
          <label className="markup-filter markup-pages">
            <span>Pages</span>
            <input type="text" placeholder="All, or 1-3, 5" value={pages} aria-invalid={filter.pages?.length === 0 || undefined} onChange={(event) => setRange(event.target.value)} />
            <button type="button" onClick={() => setRange(String(currentPage))}>
              This page
            </button>
          </label>
        </div>
      </details>
    </div>
  );
}
