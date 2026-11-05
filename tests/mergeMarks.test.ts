import { describe, expect, it } from "vitest";
import { mergeMarks } from "../src/lib/diffRects";

const mark = (x: number, y: number, width: number, kind = "added", current = false) => ({ x, y, width, height: 0.01, kind, current });

describe("mergeMarks", () => {
  it("joins marks on the same map row that touch or nearly touch", () => {
    const merged = mergeMarks([mark(0.5, 0.1, 0.1), mark(0.1, 0.1, 0.1), mark(0.21, 0.1015, 0.1)], 100, 100);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ x: 0.1, y: 0.1 });
    expect(merged[0].width).toBeCloseTo(0.21);
    expect(merged[0].height).toBeCloseTo(0.0115);
    expect(merged[1]).toMatchObject({ x: 0.5, width: 0.1 });
  });

  it("keeps rows, kinds, and the current change apart", () => {
    const merged = mergeMarks([mark(0.1, 0.1, 0.1), mark(0.1, 0.5, 0.1), mark(0.1, 0.1, 0.1, "removed"), mark(0.1, 0.1, 0.1, "added", true)], 100, 100);
    expect(merged).toHaveLength(4);
  });

  it("returns nothing for no marks", () => {
    expect(mergeMarks([], 100, 100)).toEqual([]);
  });
});
