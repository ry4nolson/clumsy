import { describe, expect, it } from "vitest";
import { placeOverWindow } from "../src/lib/windowPlacement";

const size = { width: 400, height: 300 };

describe("placeOverWindow", () => {
  it("centers over the owner window on its screen", () => {
    const secondScreen = { x: 1920, y: 25, width: 2560, height: 1415 };
    const owner = { x: 2200, y: 100, width: 1200, height: 860 };
    expect(placeOverWindow(owner, secondScreen, size)).toEqual({ x: 2600, y: 380, width: 400, height: 300 });
  });

  it("works on screens left of or above the primary display", () => {
    const leftScreen = { x: -1440, y: -200, width: 1440, height: 875 };
    const owner = { x: -1300, y: -150, width: 1000, height: 700 };
    expect(placeOverWindow(owner, leftScreen, size)).toEqual({ x: -1000, y: 50, width: 400, height: 300 });
  });

  it("keeps the window on screen when the owner hangs off an edge", () => {
    const screen = { x: 0, y: 25, width: 1440, height: 875 };
    const owner = { x: 1200, y: 700, width: 900, height: 600 };
    expect(placeOverWindow(owner, screen, size)).toEqual({ x: 1040, y: 600, width: 400, height: 300 });
  });

  it("shrinks to fit a screen smaller than the window", () => {
    const tiny = { x: 0, y: 0, width: 300, height: 200 };
    expect(placeOverWindow({ x: 0, y: 0, width: 300, height: 200 }, tiny, size)).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });
});
