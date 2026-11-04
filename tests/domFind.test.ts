import { describe, expect, it } from "vitest";
import { lastPieceBefore } from "../src/lib/domFind";

describe("lastPieceBefore", () => {
  const pieces = [{ start: 0 }, { start: 5 }, { start: 5 }, { start: 12 }, { start: 30 }];

  it("finds the last text node that starts before a position", () => {
    expect(lastPieceBefore(pieces, 6)).toBe(2);
    expect(lastPieceBefore(pieces, 12)).toBe(2);
    expect(lastPieceBefore(pieces, 13)).toBe(3);
    expect(lastPieceBefore(pieces, 100)).toBe(4);
  });

  it("returns -1 when nothing starts before it", () => {
    expect(lastPieceBefore(pieces, 0)).toBe(-1);
    expect(lastPieceBefore([], 10)).toBe(-1);
  });
});
