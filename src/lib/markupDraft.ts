import { isBoxKind, isLineKind, newMarkup, normalizeBox, reshapedMarkup, type Markup, type MarkupStyle } from "./markup";
import type { MarkupTool } from "./markupLayer";
import { constrainEnd, resizeBox, stampBox, type Handle, type Point } from "./markupShapes";
import { pdfDate } from "./notes";
import { reviewStamp, stampAspect } from "./stampSymbols";

const STAMP_HEIGHT = 36;
const REVIEW_HEIGHT = 40;
const MIN_STAMP = 8;

export type Draft = { pageIndex: number; start: Point; end: Point; shift: boolean; moved: boolean; rotation: number };

type Viewport = { scale: number; convertToPdfPoint(x: number, y: number): number[] };

export function draftFor(tool: MarkupTool, draft: Draft, style: MarkupStyle, stampDate: () => string): Markup | null {
  if (!tool || tool.kind === "text") {
    return null;
  }
  const id = `markup-${crypto.randomUUID()}`;
  const { pageIndex, start, end, rotation } = draft;
  if (tool.kind === "stamp") {
    const review = reviewStamp(tool.stamp);
    const aspect = rotation % 180 ? 1 / stampAspect(tool.stamp) : stampAspect(tool.stamp);
    const [dx, dy] = [end[0] - start[0], end[1] - start[1]];
    const height = Math.max(Math.abs(dy), Math.abs(dx) / aspect, MIN_STAMP);
    const box = draft.moved
      ? normalizeBox([start[0], start[1], start[0] + Math.sign(dx || 1) * height * aspect, start[1] + Math.sign(dy || 1) * height])
      : stampBox(start, stampAspect(tool.stamp), review ? REVIEW_HEIGHT : STAMP_HEIGHT, rotation);
    return newMarkup(
      { id, pageIndex, kind: "stamp", box, stamp: tool.stamp, stampDate: review ? stampDate() : null, rotation, width: 0, color: review?.color ?? style.color, fill: null },
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
  if (!isBoxKind(markup.kind) || handle === "start" || handle === "end") {
    return null;
  }
  return reshapedMarkup(markup, { box: resizeBox(markup.box, handle, point, shift || markup.kind === "stamp") }, date);
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
