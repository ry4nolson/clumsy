import { describe, expect, it } from "vitest";
import { imageRects } from "../src/lib/imageRegions";

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
