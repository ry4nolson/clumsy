import { hexColor, isMeasureKind, type Markup } from "./markup";
import { MM_PER_INCH, areaOf, formatArea, formatInches, lengthOf, pathLengthOf, type MeasureFormat, type MeasureKind } from "./measure";
import { captionText, measurePoints, settingsOf } from "./measureMarkup";
import { pageLabelOf } from "./pageLabels";

export type MeasurementRow = {
  id: string;
  pageIndex: number;
  page: string;
  kind: MeasureKind;
  type: string;
  value: string;
  inches: number;
  format: MeasureFormat;
  quantity: number;
  unit: string;
  scale: string;
  color: string;
};

export type MeasurementTotal = { label: string; count: number; value: string };

export const measureTypeNames: Record<MeasureKind, string> = { "measure-length": "Length", "measure-path": "Path", "measure-area": "Area" };

const QUANTITY_PLACES = 4;

const round = (value: number) => Number(value.toFixed(QUANTITY_PLACES));

export function lengthQuantity(inches: number, { unit }: MeasureFormat): [number, string] {
  if (unit === "ft-in" || unit === "ft") {
    return [round(inches / 12), "ft"];
  }
  if (unit === "in") {
    return [round(inches), "in"];
  }
  return [round((inches * MM_PER_INCH) / (unit === "m" ? 1000 : 1)), unit];
}

export function areaQuantity(squareInches: number, { unit }: MeasureFormat): [number, string] {
  if (unit === "ft-in" || unit === "ft") {
    return [round(squareInches / 144), "sq ft"];
  }
  if (unit === "in") {
    return [round(squareInches), "sq in"];
  }
  const perInch = unit === "m" ? MM_PER_INCH / 1000 : MM_PER_INCH;
  return [round(squareInches * perInch ** 2), `${unit}²`];
}

export function measurementRow(markup: Markup, pageLabels: string[] | null): MeasurementRow | null {
  if (!isMeasureKind(markup.kind)) {
    return null;
  }
  const { scale, format } = settingsOf(markup);
  const points = measurePoints(markup);
  const area = markup.kind === "measure-area";
  const raw = area ? areaOf(points) : markup.kind === "measure-length" ? lengthOf(points) : pathLengthOf(points);
  const inches = raw * scale.inchesPerPoint ** (area ? 2 : 1);
  const [quantity, unit] = area ? areaQuantity(inches, format) : lengthQuantity(inches, format);
  return {
    id: markup.id,
    pageIndex: markup.pageIndex,
    page: pageLabelOf(pageLabels, markup.pageIndex + 1),
    kind: markup.kind,
    type: measureTypeNames[markup.kind],
    value: captionText(markup),
    inches,
    format,
    quantity,
    unit,
    scale: scale.label,
    color: hexColor(markup.color),
  };
}

const commonFormat = (rows: MeasurementRow[]) => {
  const counts = new Map<string, { format: MeasureFormat; count: number }>();
  for (const { format } of rows) {
    const key = `${format.unit}/${format.precision}`;
    const entry = counts.get(key) ?? { format, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0].format;
};

export function measurementTotals(rows: MeasurementRow[]): MeasurementTotal[] {
  const lengths = rows.filter((row) => row.kind !== "measure-area");
  const areas = rows.filter((row) => row.kind === "measure-area");
  const totals: MeasurementTotal[] = [];
  if (lengths.length) {
    const sum = lengths.reduce((total, row) => total + row.inches, 0);
    totals.push({ label: "Total length", count: lengths.length, value: formatInches(sum, commonFormat(lengths)) });
  }
  if (areas.length) {
    const sum = areas.reduce((total, row) => total + row.inches, 0);
    totals.push({ label: "Total area", count: areas.length, value: formatArea(sum, { label: "", inchesPerPoint: 1 }, commonFormat(areas)) });
  }
  return totals;
}

const FORMULA_START = /^[=+\-@\t\r]/;

const NUMBER = /^-?\d+(\.\d+)?$/;

const inert = (text: string) => (FORMULA_START.test(text) && !NUMBER.test(text) ? `'${text}` : text);

function csvCell(text: string) {
  const safe = inert(text);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export const csvText = (lines: string[][]) => lines.map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";

const tsvCell = (text: string) => inert(text.replace(/[\t\r\n]+/g, " "));

export const tsvText = (lines: string[][]) => lines.map((line) => line.map(tsvCell).join("\t")).join("\n");
