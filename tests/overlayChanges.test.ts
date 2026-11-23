import { describe, expect, it } from "vitest";
import { changeBoxes, changeScale, differenceMask, inkMask, type Mask } from "../src/lib/overlayChanges";

const blank = (width = 200, height = 150): Mask => ({ width, height, ink: new Uint8Array(width * height) });

function line(mask: Mask, x1: number, y1: number, x2: number, y2: number) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      mask.ink[y * mask.width + x] = 1;
    }
  }
  return mask;
}

const drawing = () => line(line(blank(), 20, 20, 180, 21), 20, 20, 21, 130);

describe("changed regions", () => {
  it("finds nothing on identical pages", () => {
    expect(changeBoxes(drawing(), drawing())).toEqual([]);
  });

  it("ignores a one-pixel shift and stray specks", () => {
    const shifted = line(line(blank(), 21, 21, 181, 22), 21, 21, 22, 131);
    const speck = line(drawing(), 120, 90, 121, 91);
    expect(changeBoxes(drawing(), shifted)).toEqual([]);
    expect(changeBoxes(drawing(), speck)).toEqual([]);
  });

  it("boxes a moved line as one region covering both places", () => {
    const before = line(drawing(), 100, 40, 101, 100);
    const after = line(drawing(), 112, 40, 113, 100);
    const boxes = changeBoxes(before, after);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].left).toBeLessThanOrEqual(100);
    expect(boxes[0].right).toBeGreaterThanOrEqual(114);
    expect(boxes[0].top).toBeLessThanOrEqual(40);
    expect(boxes[0].bottom).toBeGreaterThanOrEqual(101);
  });

  it("keeps far apart changes separate, top to bottom", () => {
    const after = line(line(drawing(), 60, 40, 80, 41), 150, 110, 170, 111);
    const boxes = changeBoxes(drawing(), after);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].top).toBeLessThan(boxes[1].top);
    expect(boxes.every((box) => box.left >= 0 && box.top >= 0 && box.right <= 200 && box.bottom <= 150)).toBe(true);
  });

  it("keeps the largest regions when there are too many", () => {
    const after = line(line(line(drawing(), 40, 40, 44, 44), 100, 60, 140, 100), 170, 120, 174, 124);
    const [box] = changeBoxes(drawing(), after, { limit: 1 });
    expect(box.left).toBeLessThanOrEqual(100);
    expect(box.right).toBeGreaterThanOrEqual(141);
  });

  it("compares pages of different sizes over the area they share", () => {
    const difference = differenceMask(line(blank(100, 80), 10, 10, 90, 11), line(blank(120, 90), 10, 10, 90, 11));
    expect([difference.width, difference.height]).toEqual([100, 80]);
    expect(difference.ink.some(Boolean)).toBe(false);
  });
});

describe("ink", () => {
  it("counts dark and colored pixels, not light or transparent ones", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 220, 0, 0, 255, 230, 230, 230, 255, 0, 0, 0, 0]);
    expect([...inkMask(rgba, 5, 1).ink]).toEqual([1, 0, 1, 0, 0]);
  });

  it("renders at 75 dpi unless the sheet is huge", () => {
    expect(changeScale(792, 612)).toBeCloseTo(75 / 72, 6);
    expect(changeScale(14400, 14400)).toBeLessThan(0.2);
  });
});
