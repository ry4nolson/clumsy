import { describe, expect, it } from "vitest";
import { pinchCenter, pinchFactor, pinchSpan, pinchSteps, wheelFactor } from "../src/lib/zoomGestures";

describe("zoom gestures", () => {
  it("zooms in when the wheel scrolls up and out when it scrolls down", () => {
    expect(wheelFactor(-100)).toBeCloseTo(Math.E);
    expect(wheelFactor(100)).toBeCloseTo(1 / Math.E);
    expect(wheelFactor(0)).toBe(1);
  });

  it("measures the distance and midpoint between two fingers", () => {
    const first = { clientX: 100, clientY: 100 };
    const second = { clientX: 400, clientY: 500 };
    expect(pinchSpan(first, second)).toBe(500);
    expect(pinchCenter(first, second)).toEqual([250, 300]);
  });

  it("turns a change in finger distance into a scale factor", () => {
    expect(pinchFactor(200, 300)).toBe(1.5);
    expect(pinchFactor(200, 100)).toBe(0.5);
  });

  it("ignores jitter and degenerate distances", () => {
    expect(pinchFactor(200, 201)).toBeNull();
    expect(pinchFactor(0, 200)).toBeNull();
    expect(pinchFactor(200, 0)).toBeNull();
  });

  it("turns a wide enough pinch into one zoom step", () => {
    expect(pinchSteps(1.25)).toBe(1);
    expect(pinchSteps(0.8)).toBe(-1);
    expect(pinchSteps(1.1)).toBe(0);
    expect(pinchSteps(0.9)).toBe(0);
  });
});
