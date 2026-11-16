import { isBoxKind, isLineKind, isVertexKind, newMarkup, normalizeBox, reshapedMarkup, type Markup, type MarkupStyle } from "./markup";
import { snapPoint, type MeasureKind } from "./measure";
import { minVertices, withInsertedVertex, withVertex, withoutVertex } from "./measureBuild";
import type { MarkupTool } from "./markupLayer";
import { constrainEnd, isCorner, resizeBox, stampBox, vertexIndex, type Handle, type Point } from "./markupShapes";
import { pdfDate } from "./notes";
import { customStamp } from "./customStamps";
import { isDatedStamp, isWordStamp, stampAspect, stampColor } from "./stampSymbols";

const STAMP_HEIGHT = 36;
const REVIEW_HEIGHT = 40;
const IMAGE_LONGEST = 96;
const MIN_STAMP = 8;

export function stampHeight(id: string) {
  if (isWordStamp(id)) {
    return REVIEW_HEIGHT;
  }
  if (customStamp(id)?.kind === "image") {
    const aspect = stampAspect(id);
    return Math.max(MIN_STAMP, aspect >= 1 ? IMAGE_LONGEST / aspect : IMAGE_LONGEST);
  }
  return STAMP_HEIGHT;
}

export type Draft = { pageIndex: number; start: Point; end: Point; shift: boolean; moved: boolean; rotation: number };

type Viewport = { scale: number; convertToPdfPoint(x: number, y: number): number[] };

export function draftFor(tool: MarkupTool, draft: Draft, style: MarkupStyle, stampDate: () => string): Markup | null {
  if (!tool || tool.kind === "text" || tool.kind === "measure") {
    return null;
  }
  const id = `markup-${crypto.randomUUID()}`;
  const { pageIndex, start, end, rotation } = draft;
  if (tool.kind === "stamp") {
    const color = stampColor(tool.stamp);
    const aspect = rotation % 180 ? 1 / stampAspect(tool.stamp) : stampAspect(tool.stamp);
    const [dx, dy] = [end[0] - start[0], end[1] - start[1]];
    const height = Math.max(Math.abs(dy), Math.abs(dx) / aspect, MIN_STAMP);
    const box = draft.moved
      ? normalizeBox([start[0], start[1], start[0] + Math.sign(dx || 1) * height * aspect, start[1] + Math.sign(dy || 1) * height])
      : stampBox(start, stampAspect(tool.stamp), stampHeight(tool.stamp), rotation);
    return newMarkup(
      { id, pageIndex, kind: "stamp", box, stamp: tool.stamp, stampDate: isDatedStamp(tool.stamp) ? stampDate() : null, rotation, width: 0, color: color ?? style.color, fill: null },
      style,
      pdfDate(new Date()),
    );
  }
  const [x2, y2] = constrainEnd(tool.shape, start, end, draft.shift);
  const box = [start[0], start[1], x2, y2];
  return newMarkup({ id, pageIndex, kind: tool.shape, box, line: isLineKind(tool.shape) ? box : null }, style, pdfDate(new Date()));
}

export function resizedMarkup(markup: Markup, handle: Handle, point: Point, shift: boolean) {
  const date = pdfDate(new Date());
  if (isLineKind(markup.kind) && markup.line) {
    const [x1, y1, x2, y2] = markup.line;
    const line = handle === "start" ? [...constrainEnd(markup.kind, [x2, y2], point, shift), x2, y2] : [x1, y1, ...constrainEnd(markup.kind, [x1, y1], point, shift)];
    return reshapedMarkup(markup, { line }, date);
  }
  const vertex = vertexIndex(handle);
  if (isVertexKind(markup.kind) && markup.vertices && vertex >= 0 && vertex * 2 < markup.vertices.length) {
    const vertices = markup.vertices;
    const neighbor = vertex > 0 ? vertex - 1 : vertex + 1;
    const anchor: Point = [vertices[neighbor * 2], vertices[neighbor * 2 + 1]];
    const moved = (shift && neighbor * 2 < vertices.length ? snapPoint(anchor, point) : point) as Point;
    return reshapedMarkup(markup, { vertices: withVertex(vertices, vertex, moved) }, date);
  }
  if (!isBoxKind(markup.kind) || !isCorner(handle)) {
    return null;
  }
  return reshapedMarkup(markup, { box: resizeBox(markup.box, handle, point, shift || markup.kind === "stamp") }, date);
}

export function withVertexToggled(markup: Markup, handle: Handle | undefined, point: Point, reach: number) {
  if (!isVertexKind(markup.kind) || !markup.vertices) {
    return null;
  }
  const kind = markup.kind as MeasureKind;
  const vertices = handle ? withoutVertex(markup.vertices, vertexIndex(handle), minVertices(kind)) : withInsertedVertex(markup.vertices, point, kind === "measure-area", reach);
  return vertices && reshapedMarkup(markup, { vertices }, pdfDate(new Date()));
}

export function nudgeDelta(viewport: Viewport, key: string, step: number): Point | null {
  const pixels = step * viewport.scale;
  const offsets: Record<string, [number, number]> = { ArrowLeft: [-pixels, 0], ArrowRight: [pixels, 0], ArrowUp: [0, -pixels], ArrowDown: [0, pixels] };
  const offset = offsets[key];
  if (!offset) {
    return null;
  }
  const [ox, oy] = viewport.convertToPdfPoint(0, 0);
  const [tx, ty] = viewport.convertToPdfPoint(offset[0], offset[1]);
  return [tx - ox, ty - oy];
}

const MIN_SIZE = 1;

export function drawable(markup: Markup) {
  const [left, bottom, right, top] = markup.box;
  if (isLineKind(markup.kind)) {
    const [x1, y1, x2, y2] = markup.line ?? markup.box;
    return Math.hypot(x2 - x1, y2 - y1) >= MIN_SIZE;
  }
  return markup.kind === "stamp" || (right - left >= MIN_SIZE && top - bottom >= MIN_SIZE);
}

export const insidePage = ([x, y]: Point, [x1, y1, x2, y2]: number[]): Point => [Math.min(Math.max(x, x1), x2), Math.min(Math.max(y, y1), y2)];

export function undoBursts(windowMs: number) {
  let last = { key: "", at: 0, count: 0 };
  return (key: string) => {
    const at = Date.now();
    last = key === last.key && at - last.at < windowMs ? { key, at, count: last.count } : { key, at, count: last.count + 1 };
    return `clumsy-markup:${key}:${last.count}`;
  };
}
