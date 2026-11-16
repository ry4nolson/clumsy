import { describe, expect, it } from "vitest";
import { newMarkup } from "../src/lib/markup";
import { assembleRows, type AnnotationRecord, type RowSources } from "../src/lib/markupSources";
import { stateReplyNote } from "../src/lib/reviewState";

const style = { color: [0, 0, 1], fill: false, width: 2, opacity: 1 };
const record = (entry: Partial<AnnotationRecord>): AnnotationRecord => ({ id: "1R", pageIndex: 0, annotationType: 9, rect: [0, 0, 10, 10], color: new Uint8ClampedArray([255, 255, 0]), ...entry });

const sources = (overrides: Partial<RowSources>): RowSources => ({
  annotations: [],
  subjects: {},
  clumsy: [],
  clumsyFileIds: new Set(),
  noteChanges: [],
  editors: [],
  pageLabels: null,
  author: "Ryan",
  time: (date) => (date ? Number(date.replace(/\D/g, "")) : null),
  ...overrides,
});

const summary = (rows: ReturnType<typeof assembleRows>) => rows.map((row) => [row.id, row.type, row.subject, row.author, row.comment, row.status, row.source, row.target]);

describe("gathering markup rows", () => {
  it("lists file annotations, skipping replies, popups, links, and hidden ones", () => {
    const rows = assembleRows(
      sources({
        annotations: [
          record({ id: "1R", titleObj: { str: "Bobby" }, contentsObj: { str: "Check" }, modificationDate: "D:5" }),
          record({ id: "2R", annotationType: 2 }),
          record({ id: "3R", annotationType: 16 }),
          record({ id: "4R", annotationType: 1, inReplyTo: "1R", stateModel: "Review", state: "Accepted", modificationDate: "D:9" }),
          record({ id: "5R", annotationFlags: 2 }),
          record({ id: "6R", annotationType: 4, it: "LineDimension" }),
          record({ id: "7R", annotationType: 15, annotationFlags: 128 }),
        ],
        subjects: { "1R": "Review comment" },
      }),
    );
    expect(summary(rows)).toEqual([
      ["1R", "Highlight", "Review comment", "Bobby", "Check", "Accepted", "file", "annotation"],
      ["6R", "Line", "Line", "", "", null, "file", "annotation"],
      ["7R", "Drawing", "Drawing", "", "", null, "file", "annotation"],
    ]);
    expect(rows[0].color).toBe("#ffff00");
    expect(rows[0].date).toBe(5);
  });

  it("takes Clumsy's markup over the file's copy and drops what Clumsy deleted", () => {
    const fileShape = { ...newMarkup({ id: "8R", pageIndex: 0, kind: "rectangle", box: [0, 0, 10, 10], rotation: 0 }, style, "D:3"), fresh: false, subject: "Drywall" };
    const fresh = newMarkup({ id: "markup-1", pageIndex: 1, kind: "stamp", box: [0, 0, 20, 20], rotation: 0, stamp: "elec:receptacle-duplex" }, style, "D:7");
    const rows = assembleRows(
      sources({
        annotations: [record({ id: "8R", annotationType: 5, titleObj: { str: "Ann" }, contentsObj: { str: "Move wall" } }), record({ id: "9R", annotationType: 5 })],
        clumsy: [fileShape, fresh],
        clumsyFileIds: new Set(["8R", "9R"]),
      }),
    );
    expect(summary(rows)).toEqual([
      ["8R", "Rectangle", "Drywall", "Ann", "Move wall", null, "file", "markup"],
      ["markup-1", "Stamp", "Duplex Receptacle", "Ryan", "", null, "clumsy", "markup"],
    ]);
  });

  it("lists sticky notes with their edits and keeps state replies out of them", () => {
    const reply = stateReplyNote("state-1", { id: "10R", pageIndex: 0, rect: [0, 0, 20, 20] }, "Completed", "Ryan", "D:20");
    const edited = { id: "10R", pageIndex: 0, rect: [0, 0, 20, 20], text: "Edited", color: null, date: "D:21", fresh: false, deleted: false };
    const rows = assembleRows(
      sources({
        annotations: [record({ id: "10R", annotationType: 1, contentsObj: { str: "Original" }, titleObj: { str: "Sam" } }), record({ id: "11R", annotationType: 1 })],
        noteChanges: [edited, { ...edited, id: "11R", deleted: true }, reply],
      }),
    );
    expect(summary(rows)).toEqual([["10R", "Note", "Note", "Sam", "Edited", "Completed", "file", "note"]]);
  });

  it("overlays pdf.js editors on file annotations and adds new ones", () => {
    const rows = assembleRows(
      sources({
        annotations: [record({ id: "12R", annotationType: 3, contentsObj: { str: "old" } }), record({ id: "13R" }), record({ id: "1R", contentsObj: { str: "Deleted comment" } })],
        editors: [
          { key: "pdfjs_internal_editor_0", id: "12R", annotationType: 3, pageIndex: 0, rect: [5, 5, 50, 20], value: "new text" },
          { key: "pdfjs_internal_editor_1", id: "13R", deleted: true, annotationType: 9, pageIndex: 0, rect: [0, 0, 1, 1] },
          { key: "pdfjs_internal_editor_4", id: "1R", annotationType: 9, pageIndex: 0, rect: [0, 0, 10, 10], popup: { deleted: true } },
          { key: "pdfjs_internal_editor_2", annotationType: 15, pageIndex: 2, rect: [1, 2, 3, 4], color: [0, 0, 255] },
          { key: "pdfjs_internal_editor_3", annotationType: 101, pageIndex: 0, rect: [1, 2, 3, 4] },
        ],
      }),
    );
    expect(summary(rows)).toEqual([
      ["12R", "Text Box", "Text Box", "", "new text", null, "editor", "annotation"],
      ["1R", "Highlight", "Highlight", "", "", null, "editor", "annotation"],
      ["pdfjs_internal_editor_2", "Drawing", "Drawing", "", "", null, "editor", "annotation"],
      ["pdfjs_internal_editor_3", "Stamp", "Stamp", "", "", null, "editor", "annotation"],
    ]);
    expect(rows[0].rect).toEqual([5, 5, 50, 20]);
    expect(rows[2]).toMatchObject({ page: "3", color: "#0000ff" });
  });
});
