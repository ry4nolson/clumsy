import { multiply, type Matrix } from "./contentPlacements";

export type Point = { x: number; y: number };

export type PageBox = { left: number; bottom: number; right: number; top: number };

export type PageView = { matrix: Matrix; width: number; height: number };

const TINY = 1e-6;
const MIN_SPAN = 4;

export const applyMatrix = (matrix: Matrix, point: Point): Point => ({
  x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
  y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
});

export const quarterTurns = (rotate: number) => ((Math.round(rotate / 90) % 4) + 4) % 4;

export function pageView(box: PageBox, rotate: number): PageView {
  const width = box.right - box.left;
  const height = box.top - box.bottom;
  switch (quarterTurns(rotate)) {
    case 1:
      return { matrix: [0, -1, 1, 0, -box.bottom, box.right], width: height, height: width };
    case 2:
      return { matrix: [-1, 0, 0, -1, box.right, box.top], width, height };
    case 3:
      return { matrix: [0, 1, -1, 0, box.top, -box.left], width: height, height: width };
    default:
      return { matrix: [1, 0, 0, 1, -box.left, -box.bottom], width, height };
  }
}

export const centered = (from: { width: number; height: number }, onto: { width: number; height: number }): Matrix => [
  1,
  0,
  0,
  1,
  (onto.width - from.width) / 2,
  (onto.height - from.height) / 2,
];

export function similarityFrom(from: [Point, Point], to: [Point, Point]): Matrix | null {
  const dx = from[1].x - from[0].x;
  const dy = from[1].y - from[0].y;
  const length = dx * dx + dy * dy;
  const tx = to[1].x - to[0].x;
  const ty = to[1].y - to[0].y;
  if (length < MIN_SPAN * MIN_SPAN || tx * tx + ty * ty < MIN_SPAN * MIN_SPAN) {
    return null;
  }
  const a = (tx * dx + ty * dy) / length;
  const b = (ty * dx - tx * dy) / length;
  return [a, b, -b, a, to[0].x - (a * from[0].x - b * from[0].y), to[0].y - (b * from[0].x + a * from[0].y)];
}

export function affineFrom(from: [Point, Point, Point], to: [Point, Point, Point]): Matrix | null {
  const [p0, p1, p2] = from;
  const determinant = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
  const span = Math.max(Math.hypot(p1.x - p0.x, p1.y - p0.y), Math.hypot(p2.x - p0.x, p2.y - p0.y));
  if (Math.abs(determinant) < TINY * Math.max(1, span * span)) {
    return null;
  }
  const solve = (v0: number, v1: number, v2: number) => {
    const first = ((v1 - v0) * (p2.y - p0.y) - (v2 - v0) * (p1.y - p0.y)) / determinant;
    const second = ((v2 - v0) * (p1.x - p0.x) - (v1 - v0) * (p2.x - p0.x)) / determinant;
    return [first, second, v0 - first * p0.x - second * p0.y];
  };
  const [a, c, e] = solve(to[0].x, to[1].x, to[2].x);
  const [b, d, f] = solve(to[0].y, to[1].y, to[2].y);
  return Math.abs(a * d - b * c) < TINY ? null : [a, b, c, d, e, f];
}

export function alignmentFrom(from: Point[], to: Point[]): Matrix | null {
  if (from.length >= 3 && to.length >= 3) {
    return affineFrom([from[0], from[1], from[2]], [to[0], to[1], to[2]]) ?? similarityFrom([from[0], from[1]], [to[0], to[1]]);
  }
  return from.length >= 2 && to.length >= 2 ? similarityFrom([from[0], from[1]], [to[0], to[1]]) : null;
}

export const placedOn = (view: PageView, alignment: Matrix): Matrix => multiply(view.matrix, alignment);

export const describeAlignment = (matrix: Matrix) => {
  const scale = Math.hypot(matrix[0], matrix[1]);
  const turn = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
  return { scale, turn, x: matrix[4], y: matrix[5] };
};
