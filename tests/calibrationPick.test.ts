import { describe, expect, it } from "vitest";
import { longEnough, screenLine } from "../src/lib/calibrationPick";

describe("the calibration pick", () => {
  it("follows the pointer, or snaps to 45° steps with Shift", () => {
    expect(screenLine([10, 10], [50, 13], false)).toEqual([10, 10, 50, 13]);
    const [, , x, y] = screenLine([10, 10], [50, 13], true);
    expect(y).toBeCloseTo(10, 9);
    expect(x).toBeGreaterThan(49);
    const [, , dx, dy] = screenLine([0, 0], [30, 28], true);
    expect(dx).toBeCloseTo(dy, 9);
  });

  it("ignores lines too short to mean anything", () => {
    expect(longEnough([0, 0, 2, 2])).toBe(false);
    expect(longEnough([0, 0, 0, 40])).toBe(true);
  });
});
