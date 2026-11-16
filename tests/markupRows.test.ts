import { describe, expect, it } from "vitest";
import { newMarkup, pointsBox, type Markup } from "../src/lib/markup";
import {
  emptyFilter,
  filterRows,
  groupRows,
  markupsCsv,
  rowFromAnnotation,
  rowFromMarkup,
  rowTotals,
  sortRows,
  summaryCsv,
  type AnnotationEntry,
  type MarkupRow,
  type RowExtras,
} from "../src/lib/markupRows";
import { defaultFormat, scalePresets } from "../src/lib/measure";

const eighth = scalePresets.find((scale) => scale.label === `1/8" = 1'-0"`)!;
const style = { color: [1, 0, 0], fill: false, width: 2, opacity: 1 };
const extras: RowExtras = { author: "", comment: "", date: null, status: null, source: "clumsy" };

const stamp = (id: string, pageIndex: number, stampId: string, subject?: string): Markup => ({
  ...newMarkup({ id, pageIndex, kind: "stamp", box: [pageIndex * 10, 0, pageIndex * 10 + 20, 20], rotation: 0, stamp: stampId }, style, "D:1"),
  subject,
});
const run = (id: string, pageIndex: number, vertices: number[], subject: string): Markup => ({
  ...newMarkup({ id, pageIndex, kind: "measure-path", box: pointsBox(vertices), vertices, measure: { scale: eighth, format: defaultFormat }, rotation: 0, fill: null }, style, "D:1"),
  subject,
});
const room = (id: string, vertices: number[]): Markup =>
  newMarkup({ id, pageIndex: 0, kind: "measure-area", box: pointsBox(vertices), vertices, measure: { scale: eighth, format: defaultFormat }, rotation: 0, fill: null }, style, "D:1");

const annotation = (entry: Partial<AnnotationEntry>): AnnotationEntry => ({
  id: "1R",
  pageIndex: 0,
  annotationType: 9,
  rect: [0, 0, 10, 10],
  color: [1, 1, 0],
  author: "",
  subject: "",
  comment: "",
  date: null,
  readOnly: false,
  source: "file",
  target: "comment",
  ...entry,
});

const rowsOf = (markups: Markup[]) => markups.map((markup) => rowFromMarkup(markup, null, extras));

const takeoff = () =>
  rowsOf([
    stamp("r1", 0, "elec:receptacle-duplex"),
    stamp("r2", 1, "elec:receptacle-duplex"),
    stamp("d1", 0, "elec:fixture-downlight"),
    stamp("t1", 1, "elec:fixture-troffer", "Type A fixture"),
    stamp("t2", 1, "elec:fixture-troffer", " type a FIXTURE "),
    run("c1", 0, [0, 0, 72, 0], "Conduit run"),
    run("c2", 1, [0, 0, 36, 0, 36, 72], "Conduit run"),
  ]);

describe("markup rows", () => {
  it("names rows from the subject, then the stamp, then the type", () => {
    const [receptacle, , , fixture] = takeoff();
    expect(receptacle).toMatchObject({ type: "Stamp", subject: "Duplex Receptacle", page: "1", color: "#ff0000", target: "markup" });
    expect(fixture.subject).toBe("Type A fixture");
    const highlight = rowFromAnnotation(annotation({ author: "Bobby", comment: "Check" }), ["A-1"], "Accepted");
    expect(highlight).toMatchObject({ type: "Highlight", subject: "Highlight", page: "A-1", author: "Bobby", status: "Accepted", color: "#ffff00" });
    expect(rowFromAnnotation(annotation({ subject: "Count: Exit" }), null, null).subject).toBe("Count: Exit");
  });

  it("counts by subject, folding case and spaces, with measurement totals per group", () => {
    const groups = groupRows(takeoff(), "subject");
    expect(groups.map((group) => [group.label, group.rows.length, group.totals.map((total) => total.value)])).toEqual([
      ["Conduit run", 2, [`20' 0"`]],
      ["Duplex Receptacle", 2, []],
      ["Recessed Downlight", 1, []],
      ["Type A fixture", 2, []],
    ]);
    expect(groupRows(takeoff(), "page").map((group) => [group.label, group.rows.length])).toEqual([
      ["Page 1", 3],
      ["Page 2", 4],
    ]);
  });

  it("recounts after filtering by page, subject, status, and text", () => {
    const rows = takeoff();
    const pageOne = filterRows(rows, { ...emptyFilter, pages: [1] });
    expect(groupRows(pageOne, "subject").map((group) => [group.label, group.rows.length])).toEqual([
      ["Conduit run", 1],
      ["Duplex Receptacle", 1],
      ["Recessed Downlight", 1],
    ]);
    expect(filterRows(rows, { ...emptyFilter, subjects: ["type a fixture"] }).map((row) => row.id)).toEqual(["t1", "t2"]);
    expect(filterRows(rows, { ...emptyFilter, statuses: ["None"] })).toHaveLength(7);
    expect(filterRows(rows, { ...emptyFilter, statuses: ["Accepted"] })).toHaveLength(0);
    expect(filterRows(rows, { ...emptyFilter, text: "downlight" }).map((row) => row.id)).toEqual(["d1"]);
  });

  it("sorts stably, with page order breaking ties", () => {
    const rows = takeoff();
    expect(sortRows(rows, "page").map((row) => row.id)).toEqual(["r1", "d1", "c1", "c2", "r2", "t1", "t2"]);
    expect(sortRows(rows, "subject").map((row) => row.id)).toEqual(["c1", "c2", "r1", "r2", "d1", "t1", "t2"]);
    expect(sortRows(rows, "value", true)[0].id).toBe("c2");
  });

  it("totals lengths and areas for whatever is shown", () => {
    const rows = [...takeoff(), rowFromMarkup(room("a", [0, 0, 72, 0, 72, 72, 0, 72]), null, extras)];
    expect(rowTotals(rows).map((total) => [total.label, total.count, total.value])).toEqual([
      ["Total length", 2, `20' 0"`],
      ["Total area", 1, "64.00 sq ft"],
    ]);
  });

  it("exports one row per markup and one row per subject, without formulas", () => {
    const rows: MarkupRow[] = [...takeoff(), rowFromAnnotation(annotation({ id: "9R", comment: "=1+1", author: "Ann", date: Date.UTC(2026, 10, 16, 9, 30) }), null, "Completed")];
    const csv = markupsCsv(rows).split("\r\n");
    expect(csv[0]).toBe("Page,Type,Subject,Comment,Author,Date,Status,Value,Quantity,Unit,Scale,Color,X,Y");
    expect(csv[1]).toBe("1,Stamp,Duplex Receptacle,,,,,,,,,#ff0000,0,0");
    expect(csv[8]).toBe("1,Highlight,Highlight,'=1+1,Ann,2026-11-16 09:30,Completed,,,,,#ffff00,0,0");
    expect(markupsCsv([rowFromAnnotation(annotation({ subject: 'Panel "A", east' }), null, null)]).split("\r\n")[1]).toBe('1,Highlight,"Panel ""A"", east",,,,,,,,,#ffff00,0,0');
    const summary = summaryCsv(rows).split("\r\n");
    expect(summary).toEqual([
      "Subject,Type,Count,Length,Length Unit,Area,Area Unit",
      "Conduit run,Path,2,20,ft,,",
      "Duplex Receptacle,Stamp,2,,,,",
      "Highlight,Highlight,1,,,,",
      "Recessed Downlight,Stamp,1,,,,",
      "Type A fixture,Stamp,2,,,,",
      "",
    ]);
  });
});
