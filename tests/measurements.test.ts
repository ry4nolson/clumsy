import { describe, expect, it } from "vitest";
import { newMarkup, pointsBox, type Markup } from "../src/lib/markup";
import { defaultFormat, scalePresets, type MeasureFormat } from "../src/lib/measure";
import { measurementRows, measurementTotals, measurementsCsv, measurementsTsv } from "../src/lib/measurements";

const eighth = scalePresets.find((scale) => scale.label === `1/8" = 1'-0"`)!;
const style = { color: [1, 0, 0.5], fill: false, width: 2, opacity: 1 };
const metric: MeasureFormat = { unit: "m", precision: 2 };

const length = (id: string, pageIndex: number, points: number[], format = defaultFormat): Markup =>
  newMarkup({ id, pageIndex, kind: "measure-length", box: points, line: points, measure: { scale: eighth, format }, rotation: 0, fill: null }, style, "D:1");
const area = (id: string, pageIndex: number, vertices: number[]): Markup =>
  newMarkup({ id, pageIndex, kind: "measure-area", box: pointsBox(vertices), vertices, measure: { scale: eighth, format: defaultFormat }, rotation: 0, fill: null }, style, "D:1");
const shape: Markup = newMarkup({ id: "r", pageIndex: 0, kind: "square", box: [0, 0, 10, 10], rotation: 0 }, style, "D:1");

describe("measurement list", () => {
  it("lists only measurements, by page, with page labels and plain quantities", () => {
    const rows = measurementRows([length("b", 1, [0, 0, 72, 0]), shape, area("a", 0, [0, 0, 72, 0, 72, 72, 0, 72])], ["i", "ii"]);
    expect(rows.map((row) => [row.id, row.page, row.type, row.value, row.quantity, row.unit, row.color])).toEqual([
      ["a", "i", "Area", "64.00 sq ft", 64, "sq ft", "#ff0080"],
      ["b", "ii", "Length", `8' 0"`, 8, "ft", "#ff0080"],
    ]);
    expect(measurementRows([length("m", 0, [0, 0, 72, 0], metric)], null)[0]).toMatchObject({ page: "1", value: "2.44 m", quantity: 2.4384, unit: "m" });
  });

  it("totals lengths and areas separately in the most common format", () => {
    const rows = measurementRows([length("a", 0, [0, 0, 72, 0]), length("b", 0, [0, 0, 36, 0]), length("c", 0, [0, 0, 72, 0], metric), area("d", 0, [0, 0, 72, 0, 72, 72])], null);
    expect(measurementTotals(rows)).toEqual([
      { label: "Total length", count: 3, value: `20' 0"` },
      { label: "Total area", count: 1, value: "32.00 sq ft" },
    ]);
    expect(measurementTotals([])).toEqual([]);
  });

  it("writes CSV with quoting and no formulas, and TSV for pasting", () => {
    const rows = measurementRows([length("a", 0, [0, 0, 72, 0])], ['=HYPERLINK("x")']);
    const csv = measurementsCsv(rows);
    expect(csv.split("\r\n")[0]).toBe("Page,Type,Value,Quantity,Unit,Scale,Color");
    expect(csv.split("\r\n")[1]).toBe(`"'=HYPERLINK(""x"")",Length,"8' 0""",8,ft,"1/8"" = 1'-0""",#ff0080`);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(measurementsTsv(rows).split("\n")[1]).toBe(`'=HYPERLINK("x")\tLength\t8' 0"\t8\tft\t1/8" = 1'-0"\t#ff0080`);
  });
});
