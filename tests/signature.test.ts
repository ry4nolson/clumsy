import { describe, expect, it } from "vitest";
import { inkBounds } from "../src/lib/signature";

function pixels(width: number, height: number, inked: Array<[number, number]>) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of inked) {
    data[(y * width + x) * 4 + 3] = 255;
  }
  return data;
}

describe("inkBounds", () => {
  it("returns null for an empty canvas", () => {
    expect(inkBounds(pixels(4, 4, []), 4, 4)).toBeNull();
  });

  it("finds the tight bounding box around inked pixels", () => {
    expect(inkBounds(pixels(10, 8, [[2, 3], [7, 5], [4, 1]]), 10, 8)).toEqual({ x: 2, y: 1, width: 6, height: 5 });
  });

  it("handles a single pixel", () => {
    expect(inkBounds(pixels(3, 3, [[1, 1]]), 3, 3)).toEqual({ x: 1, y: 1, width: 1, height: 1 });
  });
});
