import { hexColor, isMeasureKind, kindLabels, type Markup } from "./markup";
import { areaQuantity, csvText, lengthQuantity, measureTypeNames, measurementRow, measurementTotals, tsvText, type MeasurementRow, type MeasurementTotal } from "./measurements";
import { pageLabelOf } from "./pageLabels";
import { stampLabel } from "./stampSymbols";

export type ReviewStatus = "Accepted" | "Rejected" | "Cancelled" | "Completed" | "None";
export type RowTarget = "markup" | "note" | "comment" | "annotation";
export type RowSource = "file" | "clumsy" | "editor";

export type MarkupRow = {
  id: string;
  pageIndex: number;
  page: string;
  type: string;
  subject: string;
  author: string;
  date: number | null;
  color: string | null;
  comment: string;
  status: ReviewStatus | null;
  measure: MeasurementRow | null;
  rect: number[];
  source: RowSource;
  target: RowTarget;
  readOnly: boolean;
};

export type AnnotationEntry = {
  id: string;
  pageIndex: number;
  annotationType: number;
  rect: number[];
  color: number[] | null;
  author: string;
  subject: string;
  comment: string;
  date: number | null;
  readOnly: boolean;
  source: RowSource;
  target: RowTarget;
};

export type RowExtras = { author: string; comment: string; date: number | null; status: ReviewStatus | null; source: RowSource };

export type RowFilter = { text: string; types: string[]; subjects: string[]; authors: string[]; statuses: string[]; pages: number[] | null };
export type SortKey = "page" | "subject" | "type" | "author" | "date" | "status" | "value";
export type GroupBy = "subject" | "page" | "none";
export type RowGroup = { key: string; label: string; rows: MarkupRow[]; totals: MeasurementTotal[] };

export const emptyFilter: RowFilter = { text: "", types: [], subjects: [], authors: [], statuses: [], pages: null };

export const reviewStatuses: ReviewStatus[] = ["None", "Accepted", "Rejected", "Cancelled", "Completed"];

export const annotationTypeNames: Record<number, string> = {
  1: "Note",
  3: "Text Box",
  4: "Line",
  5: "Rectangle",
  6: "Ellipse",
  7: "Polygon",
  8: "Polyline",
  9: "Highlight",
  10: "Underline",
  11: "Squiggly",
  12: "Strikethrough",
  13: "Stamp",
  14: "Caret",
  15: "Drawing",
  17: "Attachment",
};

export const listedAnnotationTypes = new Set(Object.keys(annotationTypeNames).map(Number));

const typeOfMarkup = (markup: Markup) => (isMeasureKind(markup.kind) ? measureTypeNames[markup.kind] : kindLabels[markup.kind]);

export const defaultSubject = (markup: Markup) => (markup.kind === "stamp" && markup.stamp ? stampLabel(markup.stamp) : typeOfMarkup(markup));

export function rowFromMarkup(markup: Markup, pageLabels: string[] | null, extras: RowExtras): MarkupRow {
  return {
    id: markup.id,
    pageIndex: markup.pageIndex,
    page: pageLabelOf(pageLabels, markup.pageIndex + 1),
    type: typeOfMarkup(markup),
    subject: markup.subject?.trim() || defaultSubject(markup),
    author: extras.author,
    date: extras.date,
    color: hexColor(markup.color),
    comment: extras.comment,
    status: extras.status,
    measure: isMeasureKind(markup.kind) ? measurementRow(markup, pageLabels) : null,
    rect: markup.box,
    source: extras.source,
    target: "markup",
    readOnly: false,
  };
}

export function rowFromAnnotation(entry: AnnotationEntry, pageLabels: string[] | null, status: ReviewStatus | null): MarkupRow {
  const type = annotationTypeNames[entry.annotationType] ?? "Markup";
  return {
    id: entry.id,
    pageIndex: entry.pageIndex,
    page: pageLabelOf(pageLabels, entry.pageIndex + 1),
    type,
    subject: entry.subject.trim() || type,
    author: entry.author,
    date: entry.date,
    color: entry.color ? hexColor(entry.color) : null,
    comment: entry.comment,
    status,
    measure: null,
    rect: entry.rect,
    source: entry.source,
    target: entry.target,
    readOnly: entry.readOnly,
  };
}

export const groupKey = (subject: string) => subject.trim().toLowerCase();

const matchesAny = (selected: string[], value: string) => !selected.length || selected.includes(value);

export function filterRows(rows: MarkupRow[], filter: RowFilter) {
  const text = filter.text.trim().toLowerCase();
  const pages = filter.pages && new Set(filter.pages);
  const subjects = filter.subjects.map(groupKey);
  return rows.filter(
    (row) =>
      matchesAny(filter.types, row.type) &&
      (!subjects.length || subjects.includes(groupKey(row.subject))) &&
      matchesAny(filter.authors, row.author) &&
      matchesAny(filter.statuses, row.status ?? "None") &&
      (!pages || pages.has(row.pageIndex + 1)) &&
      (!text || `${row.subject}\n${row.comment}\n${row.type}`.toLowerCase().includes(text)),
  );
}

const statusOrder = (status: ReviewStatus | null) => reviewStatuses.indexOf(status ?? "None");

const byPage = (a: MarkupRow, b: MarkupRow) => a.pageIndex - b.pageIndex || b.rect[3] - a.rect[3] || a.rect[0] - b.rect[0];

const comparers: Record<SortKey, (a: MarkupRow, b: MarkupRow) => number> = {
  page: () => 0,
  subject: (a, b) => a.subject.localeCompare(b.subject, undefined, { sensitivity: "base", numeric: true }),
  type: (a, b) => a.type.localeCompare(b.type),
  author: (a, b) => a.author.localeCompare(b.author, undefined, { sensitivity: "base" }),
  date: (a, b) => (a.date ?? 0) - (b.date ?? 0),
  status: (a, b) => statusOrder(a.status) - statusOrder(b.status),
  value: (a, b) => (a.measure?.inches ?? -1) - (b.measure?.inches ?? -1),
};

export function sortRows(rows: MarkupRow[], key: SortKey, descending = false) {
  const direction = descending ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => direction * comparers[key](a.row, b.row) || byPage(a.row, b.row) || a.index - b.index)
    .map(({ row }) => row);
}

const measurementsOf = (rows: MarkupRow[]) => rows.map((row) => row.measure).filter((measure): measure is MeasurementRow => !!measure);

export const rowTotals = (rows: MarkupRow[]) => measurementTotals(measurementsOf(rows));

export function groupRows(rows: MarkupRow[], by: GroupBy): RowGroup[] {
  if (by === "none") {
    return [{ key: "", label: "", rows, totals: rowTotals(rows) }];
  }
  const groups = new Map<string, { label: string; rows: MarkupRow[]; first: number }>();
  rows.forEach((row, index) => {
    const key = by === "page" ? String(row.pageIndex) : groupKey(row.subject);
    const group = groups.get(key) ?? { label: by === "page" ? `Page ${row.page}` : row.subject.trim(), rows: [], first: by === "page" ? row.pageIndex : index };
    group.rows.push(row);
    groups.set(key, group);
  });
  const ordered = [...groups.entries()].sort(([, a], [, b]) => (by === "page" ? a.first - b.first : a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true })));
  return ordered.map(([key, group]) => ({ key, label: group.label, rows: group.rows, totals: rowTotals(group.rows) }));
}

const isoDate = (time: number | null) => (time === null ? "" : new Date(time).toISOString().slice(0, 16).replace("T", " "));

const rowHeadings = ["Page", "Type", "Subject", "Comment", "Author", "Date", "Status", "Value", "Quantity", "Unit", "Scale", "Color", "X", "Y"];

const rowCells = (row: MarkupRow) => [
  row.page,
  row.type,
  row.subject,
  row.comment,
  row.author,
  isoDate(row.date),
  row.status ?? "",
  row.measure?.value ?? "",
  row.measure ? String(row.measure.quantity) : "",
  row.measure?.unit ?? "",
  row.measure?.scale ?? "",
  row.color ?? "",
  String(Math.round(Math.min(row.rect[0], row.rect[2]))),
  String(Math.round(Math.min(row.rect[1], row.rect[3]))),
];

const summaryHeadings = ["Subject", "Type", "Count", "Length", "Length Unit", "Area", "Area Unit"];

function sumIn(measures: MeasurementRow[], quantity: typeof lengthQuantity): [string, string] {
  if (!measures.length) {
    return ["", ""];
  }
  const [, unit] = quantity(0, measures[0].format);
  const same = measures.filter((measure) => quantity(0, measure.format)[1] === unit);
  const [value] = quantity(same.reduce((total, measure) => total + measure.inches, 0), measures[0].format);
  return [String(value), unit];
}

function summaryCells(group: RowGroup) {
  const types = new Set(group.rows.map((row) => row.type));
  const measures = measurementsOf(group.rows);
  const [length, lengthUnit] = sumIn(measures.filter((measure) => measure.kind !== "measure-area"), lengthQuantity);
  const [area, areaUnit] = sumIn(measures.filter((measure) => measure.kind === "measure-area"), areaQuantity);
  return [group.label, types.size === 1 ? [...types][0] : "Mixed", String(group.rows.length), length, lengthUnit, area, areaUnit];
}

export const markupsCsv = (rows: MarkupRow[]) => csvText([rowHeadings, ...rows.map(rowCells)]);
export const markupsTsv = (rows: MarkupRow[]) => tsvText([rowHeadings, ...rows.map(rowCells)]);
export const summaryCsv = (rows: MarkupRow[]) => csvText([summaryHeadings, ...groupRows(rows, "subject").map(summaryCells)]);
export const summaryTsv = (rows: MarkupRow[]) => tsvText([summaryHeadings, ...groupRows(rows, "subject").map(summaryCells)]);
