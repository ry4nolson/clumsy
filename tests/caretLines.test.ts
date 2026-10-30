import { describe, expect, it } from "vitest";
import { lineOf, nextLine, type TextBox } from "../src/lib/caretLines";

const box = (page: number, top: number, left: number, right: number, height = 12): TextBox => ({ page, top, bottom: top + height, left, right });

const page1 = [box(1, 100, 50, 200), box(1, 100, 210, 400), box(1, 120, 50, 380), box(1, 141, 50, 150), box(1, 141, 300, 420)];
const page2 = [box(2, 900, 60, 300), box(2, 920, 60, 280)];
const boxes = [...page1, ...page2];

describe("lineOf", () => {
  it("collects the boxes on a line from left to right", () => {
    expect(lineOf(boxes, 1)).toEqual([0, 1]);
    expect(lineOf(boxes, 4)).toEqual([3, 4]);
    expect(lineOf(boxes, 2)).toEqual([2]);
  });
});

describe("nextLine", () => {
  it("moves down to the box under the caret", () => {
    expect(nextLine(boxes, boxes[0], 120, 1)).toEqual({ index: 2, x: 120 });
  });

  it("picks the nearest box on the next line and clamps into it", () => {
    expect(nextLine(boxes, boxes[2], 200, 1)).toEqual({ index: 3, x: 150 });
    expect(nextLine(boxes, boxes[2], 290, 1)).toEqual({ index: 4, x: 300 });
  });

  it("moves up", () => {
    expect(nextLine(boxes, boxes[3], 80, -1)).toEqual({ index: 2, x: 80 });
    expect(nextLine(boxes, boxes[2], 390, -1)).toEqual({ index: 1, x: 390 });
  });

  it("continues on the next page and stops at the ends", () => {
    expect(nextLine(boxes, boxes[4], 350, 1)).toEqual({ index: 5, x: 300 });
    expect(nextLine(boxes, boxes[5], 100, -1)).toEqual({ index: 3, x: 100 });
    expect(nextLine(boxes, boxes[6], 100, 1)).toBeNull();
    expect(nextLine(boxes, boxes[0], 100, -1)).toBeNull();
  });

  it("treats slightly offset boxes as one line", () => {
    const wobbly = [box(1, 100, 0, 100), box(1, 103, 110, 200), box(1, 130, 0, 200)];
    expect(nextLine(wobbly, wobbly[1], 150, 1)).toEqual({ index: 2, x: 150 });
    expect(nextLine(wobbly, wobbly[2], 150, -1)).toEqual({ index: 1, x: 150 });
  });
});
