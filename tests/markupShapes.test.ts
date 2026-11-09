import { afterEach, describe, expect, it, vi } from "vitest";
import { drawable, insidePage, nudgeDelta, resizedMarkup, undoBursts } from "../src/lib/markupDraft";
import { newMarkup } from "../src/lib/markup";
import {
  boxFromRect,
  clampShift,
  cloudPath,
  cloudRadius,
  constrainEnd,
  handlePoints,
  lineEnding,
  orientedQuads,
  outerRect,
  quadsFromRects,
  textTurns,
  resizeBox,
  stampBox,
  stampMatrix,
  textMarkupSegments,
  textMarkupWidth,
} from "../src/lib/markupShapes";

const apply = ([a, b, c, d, e, f]: number[], [x, y]: number[]) => [a * x + c * y + e, b * x + d * y + f].map((value) => Math.round(value * 1000) / 1000);

describe("clouds", () => {
  it("sizes scallops to the box, within limits", () => {
    expect(cloudRadius([0, 0, 10, 10])).toBe(4);
    expect(cloudRadius([0, 0, 100, 60])).toBe(12);
    expect(cloudRadius([0, 0, 1000, 1000])).toBe(14);
  });

  it.each([
    ["tiny", [0, 0, 6, 6]],
    ["wide", [0, 0, 400, 30]],
    ["tall", [0, 0, 30, 400]],
  ])("builds a closed outline of outward cubic bumps for a %s box", (_, box) => {
    const path = cloudPath(box);
    expect(path.startsWith(`M ${box[0]} ${box[3]}`)).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path).not.toMatch(/[QA]/);
    const bumps = path.match(/C /g)!.length;
    expect(bumps).toBeGreaterThanOrEqual(12);
    const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = numbers.filter((_, index) => index % 2 === 0);
    const ys = numbers.filter((_, index) => index % 2 === 1);
    expect(Math.min(...xs)).toBeLessThan(box[0]);
    expect(Math.max(...ys)).toBeGreaterThan(box[3]);
  });
});

describe("line endings", () => {
  it.each([0, 45, 90, 135, 180, 225, 270, 315])("puts an open arrowhead's tip on the end point at %i°", (degrees) => {
    const radians = (degrees * Math.PI) / 180;
    const tip: [number, number] = [100 + Math.cos(radians) * 50, 100 + Math.sin(radians) * 50];
    const ending = lineEnding("OpenArrow", tip, [100, 100], 2)!;
    const points = ending.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect([points[2], points[3]]).toEqual(tip.map((value) => Math.round(value * 1000) / 1000));
    expect(ending.closed).toBe(false);
    const wing = Math.hypot(points[0] - tip[0], points[1] - tip[1]);
    expect(wing).toBeGreaterThan(8);
  });

  it("closes the shapes that have an inside and ignores None", () => {
    expect(lineEnding("ClosedArrow", [10, 0], [0, 0], 1)?.closed).toBe(true);
    expect(lineEnding("Circle", [10, 0], [0, 0], 1)?.closed).toBe(true);
    expect(lineEnding("None", [10, 0], [0, 0], 1)).toBeNull();
    expect(lineEnding("OpenArrow", [0, 0], [0, 0], 1)).toBeNull();
  });
});

describe("shift constraints", () => {
  it("snaps lines to 45° steps and keeps their length", () => {
    const [x, y] = constrainEnd("line", [0, 0], [100, 20], true);
    expect([Math.round(x), Math.round(y)]).toEqual([102, 0]);
    const [dx, dy] = constrainEnd("arrow", [0, 0], [100, 90], true);
    expect(Math.round(dx)).toBe(Math.round(dy));
  });

  it("makes boxes square in the drag's direction", () => {
    expect(constrainEnd("rectangle", [10, 10], [40, -50], true)).toEqual([70, -50]);
    expect(constrainEnd("ellipse", [10, 10], [40, -50], false)).toEqual([40, -50]);
  });
});

describe("resizing", () => {
  const box = [100, 100, 200, 150];

  it("moves the dragged corner and keeps the opposite one", () => {
    expect(resizeBox(box, "ne", [250, 180], false)).toEqual([100, 100, 250, 180]);
    expect(resizeBox(box, "sw", [50, 80], false)).toEqual([50, 80, 200, 150]);
  });

  it("flips past the opposite corner", () => {
    expect(resizeBox(box, "se", [60, 190], false)).toEqual([60, 150, 100, 190]);
  });

  it("keeps proportions when asked, and never collapses", () => {
    expect(resizeBox(box, "ne", [300, 160], true)).toEqual([100, 100, 300, 200]);
    expect(resizeBox(box, "ne", [100, 100], false)).toEqual([100, 100, 102, 102]);
  });

  it("moves a line's endpoints and keeps stamps in proportion", () => {
    const style = { color: [0, 0, 0], fill: false, width: 1, opacity: 1 };
    const line = newMarkup({ id: "l", pageIndex: 0, kind: "line", box: [0, 0, 10, 10], line: [0, 0, 10, 10] }, style, "D:1");
    expect(resizedMarkup(line, "start", [5, -5], false)?.line).toEqual([5, -5, 10, 10]);
    const stamp = newMarkup({ id: "s", pageIndex: 0, kind: "stamp", box: [0, 0, 40, 20], stamp: "review:void" }, style, "D:1");
    expect(resizedMarkup(stamp, "ne", [80, 25], false)?.box).toEqual([0, 0, 80, 40]);
    expect(handlePoints(line).map(([handle]) => handle)).toEqual(["start", "end"]);
    expect(handlePoints({ ...line, kind: "underline" })).toEqual([]);
  });

  it("keeps a moved markup on the page", () => {
    expect(clampShift([10, 10, 50, 50], -40, 0, [0, 0, 612, 792])).toEqual([-10, 0]);
    expect(clampShift([10, 10, 50, 50], 5, 800, [0, 0, 612, 792])).toEqual([5, 742]);
  });

  it("nudges in screen directions on a rotated view", () => {
    const viewport = { scale: 2, convertToPdfPoint: (x: number, y: number) => [y / 2, x / 2] };
    expect(nudgeDelta(viewport, "ArrowRight", 1)).toEqual([0, 1]);
    expect(nudgeDelta(viewport, "ArrowDown", 10)).toEqual([10, 0]);
    expect(nudgeDelta(viewport, "Enter", 1)).toBeNull();
  });
});

describe("rects and boxes", () => {
  it("pads a shape's /Rect for its stroke and a cloud's for its scallops", () => {
    expect(outerRect({ kind: "rectangle", box: [100, 100, 200, 200], width: 4, endings: null, quads: null })).toEqual([97, 97, 203, 203]);
    const cloud = outerRect({ kind: "cloud", box: [100, 100, 200, 200], width: 2, endings: null, quads: null });
    expect(cloud[0]).toBeLessThan(93);
    expect(outerRect({ kind: "stamp", box: [1, 2, 3, 4], width: 0, endings: null, quads: null })).toEqual([1, 2, 3, 4]);
  });

  it("reads a shape's box back from its /Rect and /RD", () => {
    expect(boxFromRect("rectangle", [97, 97, 203, 203], 4, null)).toEqual([99, 99, 201, 201]);
    expect(boxFromRect("rectangle", [97, 97, 203, 203], 4, [3, 3, 3, 3])).toEqual([100, 100, 200, 200]);
    expect(boxFromRect("line", [203, 97, 97, 203], 4, null)).toEqual([97, 97, 203, 203]);
  });
});

describe("text markup", () => {
  it("merges the pieces of each line into one quad, top line first", () => {
    const quads = quadsFromRects([
      { left: 100, right: 150, bottom: 500, top: 512 },
      { left: 150, right: 200, bottom: 499, top: 512 },
      { left: 60, right: 120, bottom: 476, top: 488 },
      { left: 0, right: 0.2, bottom: 0, top: 10 },
    ]);
    expect(quads).toEqual([100, 512, 200, 512, 100, 499, 200, 499, 60, 488, 120, 488, 60, 476, 120, 476]);
  });

  it("draws strikeouts through the middle and underlines just above the bottom", () => {
    const quad = [0, 12, 100, 12, 0, 0, 100, 0];
    expect(textMarkupSegments("strikeout", quad, 1)).toEqual([[0, 6, 100, 6]]);
    const [[, y]] = textMarkupSegments("underline", quad, 1);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(2);
    expect(textMarkupWidth(quad)).toBe(0.86);
  });
});

describe("text markup on rotated pages", () => {
  const line1 = [100, 100, 100, 300, 112, 100, 112, 300];

  it("merges pieces along the page's text direction and orders corners for it", () => {
    const quads = quadsFromRects(
      [
        { left: 100, right: 112, bottom: 100, top: 200 },
        { left: 100, right: 112, bottom: 200, top: 300 },
        { left: 120, right: 132, bottom: 100, top: 250 },
      ],
      90,
    );
    expect(quads).toEqual([...line1, 120, 100, 120, 250, 132, 100, 132, 250]);
    const [[x1, , x2]] = textMarkupSegments("underline", line1, 1);
    expect(x1).toBeGreaterThan(110);
    expect(x2).toBe(x1);
    expect(textMarkupWidth(line1)).toBe(0.86);
  });

  it("reorients quads read from a file in either corner order", () => {
    expect(orientedQuads([100, 300, 112, 300, 100, 100, 112, 100], 90)).toEqual(line1);
    expect(orientedQuads([0, 0, 100, 0, 100, 10, 0, 10])).toEqual([0, 10, 100, 10, 0, 0, 100, 0]);
    expect(orientedQuads([100, 0, 0, 0, 100, 10, 0, 10], 180)).toEqual([100, 0, 0, 0, 100, 10, 0, 10]);
    expect(orientedQuads([0, 0, 10, 0, 10, 100, 0, 100], 270)).toEqual([10, 100, 10, 0, 0, 100, 0, 0]);
  });

  it("follows the quad's own text direction over the page's rotation", () => {
    const horizontal = [60, 640, 490, 640, 60, 626, 490, 626];
    expect(orientedQuads(horizontal, 90)).toEqual(horizontal);
    expect(orientedQuads([0, 0, 100, 0, 100, 10, 0, 10], 180)).toEqual([0, 10, 100, 10, 0, 0, 100, 0]);
    expect(orientedQuads([0, 12, 4, 12, 0, 0, 4, 0])).toEqual([0, 12, 4, 12, 0, 0, 4, 0]);
  });

  it("turns a text span's screen angle into its direction on the page", () => {
    expect([0, -90, 90, 180, -180].map(textTurns)).toEqual([0, 1, 3, 2, 2]);
  });
});

describe("drafts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops shapes that come out flat, keeps stamps, and stops at the page edge", () => {
    const style = { color: [0, 0, 0], fill: false, width: 1, opacity: 1 };
    expect(drawable(newMarkup({ id: "a", pageIndex: 0, kind: "ellipse", box: [10, 10, 60, 10.5] }, style, "D:1"))).toBe(false);
    expect(drawable(newMarkup({ id: "b", pageIndex: 0, kind: "rectangle", box: [10, 10, 60, 40] }, style, "D:1"))).toBe(true);
    expect(drawable(newMarkup({ id: "c", pageIndex: 0, kind: "line", box: [10, 10, 10, 10], line: [10, 10, 10.2, 10] }, style, "D:1"))).toBe(false);
    expect(drawable(newMarkup({ id: "d", pageIndex: 0, kind: "stamp", box: [10, 10, 10, 10] }, style, "D:1"))).toBe(true);
    expect(insidePage([-5, 900], [0, 0, 612, 792])).toEqual([0, 792]);
  });

  it("gives changes of the same kind within the window the same undo type", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const typeOf = undoBursts(1000);
    const first = typeOf("nudge:a");
    vi.setSystemTime(500);
    expect(typeOf("nudge:a")).toBe(first);
    vi.setSystemTime(1400);
    expect(typeOf("nudge:a")).toBe(first);
    vi.setSystemTime(2500);
    const later = typeOf("nudge:a");
    expect(later).not.toBe(first);
    expect(typeOf("restyle:opacity:a")).not.toBe(later);
  });
});

describe("stamps", () => {
  it("maps the grid upright into the box on every page rotation", () => {
    const box = [100, 100, 140, 120];
    expect(apply(stampMatrix(box, 0, 24, 12), [0, 0])).toEqual([100, 120]);
    expect(apply(stampMatrix(box, 0, 24, 12), [24, 12])).toEqual([140, 100]);
    const turned = [100, 100, 120, 140];
    expect(apply(stampMatrix(turned, 90, 24, 12), [0, 0])).toEqual([100, 100]);
    expect(apply(stampMatrix(turned, 90, 24, 12), [24, 0])).toEqual([100, 140]);
    expect(apply(stampMatrix(box, 180, 24, 12), [0, 0])).toEqual([140, 100]);
  });

  it("centers a default-size stamp on the click, turned on rotated pages", () => {
    expect(stampBox([100, 100], 3, 20, 0)).toEqual([70, 90, 130, 110]);
    expect(stampBox([100, 100], 3, 20, 90)).toEqual([90, 70, 110, 130]);
  });
});
