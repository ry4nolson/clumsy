import { describe, expect, it } from "vitest";
import { fillTransform, imageRects, pixelRects } from "../src/lib/imageRegions";

const image = [0.1, 0.2, 0.1, 0.5, 0.6, 0.2];

describe("imageRects", () => {
  it("builds an axis-aligned rect from the three recorded corners", () => {
    expect(imageRects(image, 0)).toEqual([{ x: 0.1, y: 0.2, width: 0.5, height: expect.closeTo(0.3, 5) }]);
  });

  it("rotates rects clockwise with the page", () => {
    const [rect] = imageRects(image, 90);
    expect(rect.x).toBeCloseTo(0.5);
    expect(rect.y).toBeCloseTo(0.1);
    expect(rect.width).toBeCloseTo(0.3);
    expect(rect.height).toBeCloseTo(0.5);
  });

  it("treats negative and full-turn rotations as equivalent", () => {
    expect(imageRects(image, -270)).toEqual(imageRects(image, 90));
    expect(imageRects(image, 360)).toEqual(imageRects(image, 0));
  });

  it("clamps rects to the page and drops empty ones", () => {
    expect(imageRects([-0.2, -0.1, -0.2, 0.3, 0.4, -0.1], 0)).toEqual([{ x: 0, y: 0, width: 0.4, height: 0.3 }]);
    expect(imageRects([1.2, 0.1, 1.2, 0.3, 1.5, 0.1], 0)).toEqual([]);
  });

  it("handles multiple images", () => {
    expect(imageRects([...image, 0, 0, 0, 0.1, 0.1, 0], 0)).toHaveLength(2);
  });
});

describe("pixelRects", () => {
  it("covers every pixel a rect touches", () => {
    expect(pixelRects([{ x: 0.105, y: 0.2, width: 0.5, height: 0.301 }], 200, 100)).toEqual([{ x: 21, y: 20, width: 100, height: 31 }]);
  });

  it("scales the same rect to different canvas sizes", () => {
    const rect = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 };
    expect(pixelRects([rect], 240, 320)).toEqual([{ x: 60, y: 160, width: 120, height: 80 }]);
    expect(pixelRects([rect], 2400, 3200)).toEqual([{ x: 600, y: 1600, width: 1200, height: 800 }]);
  });
});

describe("fillTransform", () => {
  it("stretches a fractional viewport onto the whole rounded-down canvas", () => {
    const [sx, , , sy] = fillTransform({ width: 240, height: 310 }, { width: 240.6, height: 310.9 });
    expect(sx * 240.6).toBeCloseTo(240);
    expect(sy * 310.9).toBeCloseTo(310);
  });

  it("leaves a whole-pixel viewport unscaled", () => {
    expect(fillTransform({ width: 612, height: 792 }, { width: 612, height: 792 })).toEqual([1, 0, 0, 1, 0, 0]);
  });
});
