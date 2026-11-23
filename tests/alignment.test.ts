import { describe, expect, it } from "vitest";
import { affineFrom, alignmentFrom, applyMatrix, centered, describeAlignment, pageView, placedOn, similarityFrom, type Point } from "../src/lib/alignment";
import type { Matrix } from "../src/lib/contentPlacements";

const near = (actual: Point, expected: Point) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

const through = (matrix: Matrix, points: Point[]) => points.map((point) => applyMatrix(matrix, point));

describe("two-point alignment", () => {
  const from: [Point, Point] = [
    { x: 100, y: 100 },
    { x: 500, y: 300 },
  ];

  it("solves a pure move", () => {
    const matrix = similarityFrom(from, [
      { x: 112, y: 91 },
      { x: 512, y: 291 },
    ]) as Matrix;
    [1, 0, 0, 1].forEach((value, index) => expect(matrix[index]).toBeCloseTo(value, 6));
    near(applyMatrix(matrix, { x: 0, y: 0 }), { x: 12, y: -9 });
  });

  it("solves a scale and a rotation", () => {
    const scaled = similarityFrom(from, [
      { x: 50, y: 50 },
      { x: 250, y: 150 },
    ]) as Matrix;
    expect(describeAlignment(scaled).scale).toBeCloseTo(0.5, 6);
    expect(describeAlignment(scaled).turn).toBeCloseTo(0, 6);
    const turned = similarityFrom(from, [
      { x: -100, y: 100 },
      { x: -300, y: 500 },
    ]) as Matrix;
    expect(describeAlignment(turned).turn).toBeCloseTo(90, 6);
    near(applyMatrix(turned, from[1]), { x: -300, y: 500 });
  });

  it("refuses the same point twice", () => {
    expect(similarityFrom([from[0], from[0]], [from[0], from[1]])).toBeNull();
    expect(similarityFrom(from, [from[0], from[0]])).toBeNull();
    expect(alignmentFrom([from[0]], [from[0]])).toBeNull();
    expect(similarityFrom([from[0], { x: 102, y: 101 }], from)).toBeNull();
  });
});

describe("three-point alignment", () => {
  const from: [Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 0, y: 300 },
  ];

  it("solves a skew a similarity can't", () => {
    const skew: Matrix = [1.02, 0.01, 0.05, 0.98, 7, -3];
    const to = through(skew, from) as [Point, Point, Point];
    const solved = affineFrom(from, to) as Matrix;
    solved.forEach((value, index) => expect(value).toBeCloseTo(skew[index], 6));
    expect(alignmentFrom(from, to)).toEqual(solved);
  });

  it("falls back to two points when the three are in a line", () => {
    const line: [Point, Point, Point] = [from[0], from[1], { x: 200, y: 0 }];
    expect(affineFrom(line, line)).toBeNull();
    const fallback = alignmentFrom(line, line) as Matrix;
    near(applyMatrix(fallback, { x: 30, y: 40 }), { x: 30, y: 40 });
  });
});

describe("page views", () => {
  const box = { left: 10, bottom: 20, right: 310, top: 220 };

  it("moves the crop box to the origin", () => {
    const view = pageView(box, 0);
    expect([view.width, view.height]).toEqual([300, 200]);
    near(applyMatrix(view.matrix, { x: 10, y: 20 }), { x: 0, y: 0 });
  });

  it.each([
    [90, { x: 0, y: 300 }, { x: 200, y: 0 }],
    [180, { x: 300, y: 200 }, { x: 0, y: 0 }],
    [270, { x: 200, y: 0 }, { x: 0, y: 300 }],
    [-90, { x: 200, y: 0 }, { x: 0, y: 300 }],
  ])("turns the page for /Rotate %i", (rotate, bottomLeft, topRight) => {
    const view = pageView(box, rotate);
    expect([view.width, view.height]).toEqual(rotate % 180 ? [200, 300] : [300, 200]);
    near(applyMatrix(view.matrix, { x: 10, y: 20 }), bottomLeft);
    near(applyMatrix(view.matrix, { x: 310, y: 220 }), topRight);
  });

  it("composes a rotated page with an alignment", () => {
    const view = pageView(box, 90);
    const placed = placedOn(view, centered(view, { width: 400, height: 400 }));
    near(applyMatrix(placed, { x: 10, y: 20 }), { x: 100, y: 350 });
  });
});
