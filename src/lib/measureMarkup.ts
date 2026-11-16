import { isMeasureKind, type Markup, type MeasureSettings } from "./markup";
import { defaultFormat, fullSize, labelPoint, lineCaption, measureCaption, pathCaption, uprightAngle, type Caption } from "./measure";

export const CAPTION_SIZE = 10;
export const CAPTION_GAP = 3;
export const CAPTION_CAP_HEIGHT = 0.72;
const CAPTION_DESCENT = 0.22;
const WIDEST_GLYPH = 0.62;

type MeasureShape = Pick<Markup, "kind" | "line" | "vertices" | "measure" | "rotation">;

export const fallbackSettings: MeasureSettings = { scale: fullSize, format: defaultFormat };

export const settingsOf = (markup: Pick<Markup, "measure">) => markup.measure ?? fallbackSettings;

export const measurePoints = (markup: MeasureShape) => (markup.kind === "measure-length" ? markup.line : markup.vertices) ?? [];

export function captionText(markup: MeasureShape) {
  if (!isMeasureKind(markup.kind)) {
    return "";
  }
  const { scale, format } = settingsOf(markup);
  return measureCaption(markup.kind, measurePoints(markup), scale, format);
}

export type CaptionPlacement = Caption & { centered: boolean };

export function captionPlacement(markup: MeasureShape): CaptionPlacement {
  const points = measurePoints(markup);
  if (markup.kind === "measure-area") {
    const [x, y] = labelPoint(points);
    return { x, y, angle: uprightAngle((markup.rotation * Math.PI) / 180, markup.rotation), centered: true };
  }
  const caption = markup.kind === "measure-length" ? lineCaption(points, markup.rotation) : pathCaption(points, markup.rotation);
  return { ...caption, centered: false };
}

export const captionBaseline = ({ centered }: CaptionPlacement) => (centered ? (-CAPTION_SIZE * CAPTION_CAP_HEIGHT) / 2 : CAPTION_GAP);

export function captionCorners(markup: MeasureShape, text = captionText(markup)) {
  if (!text) {
    return [];
  }
  const placement = captionPlacement(markup);
  const half = (text.length * CAPTION_SIZE * WIDEST_GLYPH) / 2 + 1;
  const baseline = captionBaseline(placement);
  const [bottom, top] = [baseline - CAPTION_SIZE * CAPTION_DESCENT - 1, baseline + CAPTION_SIZE + 1];
  const [cos, sin] = [Math.cos(placement.angle), Math.sin(placement.angle)];
  return [
    [-half, bottom],
    [half, bottom],
    [half, top],
    [-half, top],
  ].map(([u, v]) => [placement.x + u * cos - v * sin, placement.y + u * sin + v * cos]);
}

const fmt = (value: number) => String(Math.round(value * 1000) / 1000);

export function vertexPath(vertices: number[], closed: boolean) {
  const parts: string[] = [];
  for (let index = 0; index + 1 < vertices.length; index += 2) {
    parts.push(`${index ? "L" : "M"} ${fmt(vertices[index])} ${fmt(vertices[index + 1])}`);
  }
  return `${parts.join(" ")}${closed && parts.length ? " Z" : ""}`;
}
