import { describe, expect, it } from "vitest";
import { buildComparison, overlaysFor } from "../src/lib/comparison";
import { markerRect, mergeLineRects, rotateRect, type PageRect } from "../src/lib/diffRects";
import type { Token } from "../src/lib/diffTokens";
import { syncLocation } from "../src/lib/scrollSync";
import { diffWords } from "../src/lib/textDiff";

const rect = (page: number, x: number, y: number, width = 0.1, height = 0.02): PageRect => ({ page, x, y, width, height });

function tokens(lines: string[][]): Token[] {
  return lines.flatMap((words, line) => words.map((text, index) => ({ text, rects: [rect(Math.floor(line / 10), index * 0.12, (line % 10) * 0.1)] })));
}

function compare(left: string[][], right: string[][], pages = { left: 1, right: 1 }) {
  const a = tokens(left);
  const b = tokens(right);
  const segments = diffWords(a.map((token) => token.text), b.map((token) => token.text))!;
  return buildComparison(a, b, segments, pages);
}

describe("diffRects", () => {
  it("merges boxes on one line and keeps separate lines apart", () => {
    expect(mergeLineRects([rect(0, 0, 0), rect(0, 0.12, 0), rect(0, 0, 0.1)])).toEqual([rect(0, 0, 0, 0.22), rect(0, 0, 0.1)]);
    expect(mergeLineRects([rect(0, 0, 0), rect(1, 0.12, 0)])).toHaveLength(2);
  });

  it("places an insertion marker after the previous word or before the next", () => {
    expect(markerRect(rect(0, 0.2, 0.5), undefined)).toMatchObject({ page: 0, x: expect.closeTo(0.3), y: 0.5 });
    expect(markerRect(undefined, rect(2, 0.2, 0.5))).toMatchObject({ page: 2, x: expect.closeTo(0.196), y: 0.5 });
    expect(markerRect(undefined, undefined)).toBeNull();
  });

  it("rotates rects clockwise", () => {
    expect(rotateRect(rect(0, 0.1, 0.2, 0.3, 0.1), 90)).toMatchObject({ x: expect.closeTo(0.7), y: 0.1, width: 0.1, height: 0.3 });
    expect(rotateRect(rect(0, 0.1, 0.2, 0.3, 0.1), 180)).toMatchObject({ x: expect.closeTo(0.6), y: expect.closeTo(0.7) });
    expect(rotateRect(rect(0, 0.1, 0.2, 0.3, 0.1), -90)).toMatchObject({ x: 0.2, y: expect.closeTo(0.6), width: 0.1, height: 0.3 });
  });
});

describe("buildComparison", () => {
  it("finds nothing for identical text", () => {
    const result = compare([["a", "b"], ["c"]], [["a", "b"], ["c"]]);
    expect(result.changes).toEqual([]);
    expect(result.anchors).toHaveLength(2);
  });

  it("classifies changes and keeps snippets", () => {
    const result = compare([["the", "quick", "fox"], ["jumps", "high"]], [["the", "slow", "fox"], ["jumps", "high", "today"]]);
    expect(result.changes.map((change) => [change.kind, change.before, change.after])).toEqual([
      ["modified", "quick", "slow"],
      ["added", "", "today"],
    ]);
  });

  it("highlights changed words and marks where text was inserted", () => {
    const [change] = compare([["a", "c"]], [["a", "b", "c"]]).changes;
    expect(change.right).toEqual([rect(0, 0.12, 0)]);
    expect(change.left).toEqual([expect.objectContaining({ page: 0, x: expect.closeTo(0.1), width: 0.004 })]);
  });

  it("notes pages that were wholly added or have no text", () => {
    const left = [["a"]];
    const right = [["a"], ...Array.from({ length: 9 }, () => []), ["new", "page"]];
    const result = compare(left, right, { left: 2, right: 2 });
    expect(result.notes.left).toEqual([null, "noText"]);
    expect(result.notes.right).toEqual([null, "added"]);
  });

  it("builds overlays per page with markers on the empty side", () => {
    const result = compare([["a", "b"]], [["a"]]);
    expect(overlaysFor(result, "left").get(0)?.rects).toEqual([expect.objectContaining({ kind: "removed", marker: false, change: 0 })]);
    expect(overlaysFor(result, "right").get(0)?.rects).toEqual([expect.objectContaining({ kind: "removed", marker: true, change: 0 })]);
  });
});

describe("syncLocation", () => {
  const flat = { left: 0, right: 0 };
  const anchors = [
    { left: rect(0, 0, 0.1), right: rect(0, 0, 0.1) },
    { left: rect(0, 0, 0.5), right: rect(1, 0, 0.2) },
    { left: rect(2, 0, 0.3), right: rect(3, 0, 0.3) },
  ];

  it("follows the nearest anchor above the viewport top", () => {
    expect(syncLocation(anchors, "left", { page: 0, y: 0.6 }, flat, 5)).toEqual({ page: 1, y: expect.closeTo(0.3) });
    expect(syncLocation(anchors, "right", { page: 1, y: 0.25 }, flat, 5)).toEqual({ page: 0, y: expect.closeTo(0.55) });
  });

  it("uses the first anchor on the page when the top is above all of them", () => {
    expect(syncLocation(anchors, "left", { page: 0, y: 0.05 }, flat, 5)).toEqual({ page: 0, y: expect.closeTo(0.05) });
  });

  it("carries the page offset from the last anchor for pages without one", () => {
    expect(syncLocation(anchors, "left", { page: 1, y: 0.4 }, flat, 5)).toEqual({ page: 2, y: 0.4 });
    expect(syncLocation([], "left", { page: 7, y: 0.4 }, flat, 5)).toEqual({ page: 4, y: 0 });
  });

  it("spills onto the next page", () => {
    expect(syncLocation([{ left: rect(0, 0, 0.1), right: rect(0, 0, 0.9) }], "left", { page: 0, y: 0.3 }, flat, 2)).toEqual({ page: 1, y: expect.closeTo(0.1) });
  });

  it("compares positions in each side's rotation", () => {
    const rotated = [{ left: rect(0, 0.6, 0, 0.1, 0.02), right: rect(0, 0, 0.2) }];
    expect(syncLocation(rotated, "left", { page: 0, y: 0.7 }, { left: 90, right: 0 }, 1)).toEqual({ page: 0, y: expect.closeTo(0.3) });
  });
});

describe("syncLocation at the document edges", () => {
  it("keeps the space above the first page", () => {
    const anchors = [{ left: rect(0, 0, 0.1), right: rect(0, 0, 0.1) }];
    expect(syncLocation(anchors, "left", { page: 0, y: -0.02 }, { left: 0, right: 0 }, 1)).toEqual({ page: 0, y: expect.closeTo(-0.02) });
  });
});
