import { newMarkup, pointsBox, type Markup, type MarkupStyle, type MeasureSettings } from "./markup";
import { areaOf, lengthOf, pathLengthOf, type MeasureKind } from "./measure";
import type { Point } from "./markupShapes";

export type MeasureBuild = { id: string; pageIndex: number; kind: MeasureKind; vertices: number[]; rotation: number; settings: MeasureSettings };

const MIN_MEASURE = 1;

export const minVertices = (kind: MeasureKind) => (kind === "measure-area" ? 3 : 2);

export const vertexCount = (build: Pick<MeasureBuild, "vertices">) => build.vertices.length / 2;

export const canFinish = (build: Pick<MeasureBuild, "kind" | "vertices">) => vertexCount(build) >= minVertices(build.kind);

export function buildMarkup(build: MeasureBuild, style: MarkupStyle, date: string, hover: Point | null = null): Markup | null {
  const points = hover ? [...build.vertices, ...hover] : build.vertices;
  if (points.length < 4) {
    return null;
  }
  const { id, pageIndex, kind, rotation, settings } = build;
  if (kind === "measure-length") {
    const line = points.slice(0, 4);
    return newMarkup({ id, pageIndex, kind, box: line, line, measure: settings, rotation, fill: null }, style, date);
  }
  const fill = kind === "measure-area" && style.fill ? style.color : null;
  return newMarkup({ id, pageIndex, kind, box: pointsBox(points), vertices: points, measure: settings, rotation, fill }, style, date);
}

export function measurable(markup: Pick<Markup, "kind" | "line" | "vertices">) {
  if (markup.kind === "measure-length") {
    return !!markup.line && lengthOf(markup.line) >= MIN_MEASURE;
  }
  const vertices = markup.vertices ?? [];
  return markup.kind === "measure-area" ? areaOf(vertices) >= MIN_MEASURE : pathLengthOf(vertices) >= MIN_MEASURE;
}

export function finishedMarkup(build: MeasureBuild, style: MarkupStyle, date: string) {
  const markup = canFinish(build) ? buildMarkup(build, style, date) : null;
  return markup && measurable(markup) ? markup : null;
}

export function vertexNear(screenVertices: number[], [x, y]: number[], radius: number) {
  for (let index = 0; index + 1 < screenVertices.length; index += 2) {
    if (Math.hypot(screenVertices[index] - x, screenVertices[index + 1] - y) <= radius) {
      return index / 2;
    }
  }
  return -1;
}

export function withVertex(vertices: number[], index: number, [x, y]: Point) {
  const next = [...vertices];
  next[index * 2] = x;
  next[index * 2 + 1] = y;
  return next;
}

export function withoutVertex(vertices: number[], index: number, min: number) {
  if (index < 0 || index * 2 >= vertices.length || vertices.length / 2 <= min) {
    return null;
  }
  const next = [...vertices];
  next.splice(index * 2, 2);
  return next;
}

const segmentDistance = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const length = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = length ? Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length)) : 0;
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
};

export function withInsertedVertex(vertices: number[], [x, y]: Point, closed: boolean) {
  const count = vertices.length / 2;
  const segments = closed ? count : count - 1;
  let best = -1;
  let nearest = Infinity;
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % count;
    const distance = segmentDistance(x, y, vertices[index * 2], vertices[index * 2 + 1], vertices[next * 2], vertices[next * 2 + 1]);
    if (distance < nearest) {
      nearest = distance;
      best = index;
    }
  }
  if (best < 0) {
    return null;
  }
  const result = [...vertices];
  result.splice((best + 1) * 2, 0, x, y);
  return result;
}
