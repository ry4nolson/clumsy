import { isLineKind, isTextKind, normalizeBox, quadsBox, type Markup, type MarkupKind } from "./markup";

export type Point = [number, number];
export type Corner = "nw" | "ne" | "sw" | "se";
export type Handle = Corner | "start" | "end";
export type Rect = { left: number; bottom: number; right: number; top: number };
export type Ending = { d: string; closed: boolean };

const fmt = (value: number) => String(Math.round(value * 1000) / 1000);

export function cloudRadius([left, bottom, right, top]: number[]) {
  return Math.max(4, Math.min(14, Math.min(right - left, top - bottom) / 5));
}

export const cloudOutset = (box: number[]) => cloudRadius(box) / 2;

export function cloudPath(box: number[]) {
  const [left, bottom, right, top] = box;
  const width = right - left;
  const height = top - bottom;
  const radius = cloudRadius(box);
  const across = Math.max(3, Math.ceil(width / (radius * 1.5)));
  const down = Math.max(3, Math.ceil(height / (radius * 1.5)));
  const parts = [`M ${fmt(left)} ${fmt(top)}`];
  let [x, y] = [left, top];
  const bump = (cx: number, cy: number, tx: number, ty: number) => {
    parts.push(`C ${fmt(x + ((cx - x) * 2) / 3)} ${fmt(y + ((cy - y) * 2) / 3)} ${fmt(tx + ((cx - tx) * 2) / 3)} ${fmt(ty + ((cy - ty) * 2) / 3)} ${fmt(tx)} ${fmt(ty)}`);
    [x, y] = [tx, ty];
  };
  for (let step = 1; step <= across; step++) {
    bump(left + (width * (step - 0.5)) / across, top + radius, left + (width * step) / across, top);
  }
  for (let step = 1; step <= down; step++) {
    bump(right + radius, top - (height * (step - 0.5)) / down, right, top - (height * step) / down);
  }
  for (let step = across - 1; step >= 0; step--) {
    bump(left + (width * (step + 0.5)) / across, bottom - radius, left + (width * step) / across, bottom);
  }
  for (let step = down - 1; step >= 0; step--) {
    bump(left - radius, top - (height * (step + 0.5)) / down, left, top - (height * step) / down);
  }
  return `${parts.join(" ")} Z`;
}

export const rectPath = ([left, bottom, right, top]: number[]) => `M ${fmt(left)} ${fmt(bottom)} H ${fmt(right)} V ${fmt(top)} H ${fmt(left)} Z`;

export function ellipsePath([left, bottom, right, top]: number[]) {
  const [rx, ry] = [(right - left) / 2, (top - bottom) / 2];
  const [cx, cy] = [left + rx, bottom + ry];
  const radii = `${fmt(rx)} ${fmt(ry)}`;
  return `M ${fmt(cx + rx)} ${fmt(cy)} A ${radii} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)} A ${radii} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)} Z`;
}

export function outlinePath(kind: MarkupKind, box: number[]) {
  return kind === "ellipse" ? ellipsePath(box) : kind === "cloud" ? cloudPath(box) : rectPath(box);
}

export const segmentsPath = (segments: number[][]) => segments.map(([x1, y1, x2, y2]) => `M ${fmt(x1)} ${fmt(y1)} L ${fmt(x2)} ${fmt(y2)}`).join(" ");

export const endingSize = (width: number) => Math.max(6, width * 4);

export function lineEnding(ending: string | undefined, tip: Point, tail: Point, width: number): Ending | null {
  const length = Math.hypot(tip[0] - tail[0], tip[1] - tail[1]);
  if (!ending || ending === "None" || !length) {
    return null;
  }
  const ux = (tip[0] - tail[0]) / length;
  const uy = (tip[1] - tail[1]) / length;
  const size = endingSize(width);
  const at = (along: number, across: number): Point => [tip[0] + ux * along - uy * across, tip[1] + uy * along + ux * across];
  const path = (points: Point[], close: boolean) => `${points.map(([x, y], index) => `${index ? "L" : "M"} ${fmt(x)} ${fmt(y)}`).join(" ")}${close ? " Z" : ""}`;
  const half = size * Math.tan(Math.PI / 6);
  switch (ending) {
    case "OpenArrow":
      return { d: path([at(-size, half), at(0, 0), at(-size, -half)], false), closed: false };
    case "ClosedArrow":
      return { d: path([at(-size, half), at(0, 0), at(-size, -half)], true), closed: true };
    case "ROpenArrow":
      return { d: path([at(size, half), at(0, 0), at(size, -half)], false), closed: false };
    case "RClosedArrow":
      return { d: path([at(size, half), at(0, 0), at(size, -half)], true), closed: true };
    case "Butt":
      return { d: path([at(0, half), at(0, -half)], false), closed: false };
    case "Slash":
      return { d: path([at(-half / 2, -half), at(half / 2, half)], false), closed: false };
    case "Square":
      return { d: path([at(half, half), at(-half, half), at(-half, -half), at(half, -half)], true), closed: true };
    case "Diamond":
      return { d: path([at(half, 0), at(0, half), at(-half, 0), at(0, -half)], true), closed: true };
    case "Circle": {
      const r = fmt(half);
      return { d: `M ${fmt(tip[0] + half)} ${fmt(tip[1])} A ${r} ${r} 0 1 0 ${fmt(tip[0] - half)} ${fmt(tip[1])} A ${r} ${r} 0 1 0 ${fmt(tip[0] + half)} ${fmt(tip[1])} Z`, closed: true };
    }
    default:
      return null;
  }
}

export function lineEndings(markup: Pick<Markup, "line" | "endings" | "width">) {
  const [x1, y1, x2, y2] = markup.line ?? [0, 0, 0, 0];
  const [start, end] = markup.endings ?? [];
  return [lineEnding(start, [x1, y1], [x2, y2], markup.width), lineEnding(end, [x2, y2], [x1, y1], markup.width)].filter((ending): ending is Ending => !!ending);
}

export function outsetOf(markup: Pick<Markup, "kind" | "box" | "width" | "endings">) {
  switch (markup.kind) {
    case "cloud":
      return cloudOutset(markup.box) + markup.width / 2 + 1;
    case "line":
    case "arrow":
      return (markup.endings ?? []).some((ending) => ending && ending !== "None") ? endingSize(markup.width) + markup.width : markup.width + 1;
    case "underline":
    case "strikeout":
      return markup.width;
    case "stamp":
      return 0;
    default:
      return markup.width / 2 + 1;
  }
}

export function outerRect(markup: Pick<Markup, "kind" | "box" | "width" | "endings" | "quads">) {
  const pad = outsetOf(markup);
  const [left, bottom, right, top] = isTextKind(markup.kind) && markup.quads ? quadsBox(markup.quads) : markup.box;
  return [left - pad, bottom - pad, right + pad, top + pad];
}

export function boxFromRect(kind: MarkupKind, rect: number[], width: number, inner: number[] | null) {
  const [left, bottom, right, top] = normalizeBox(rect);
  if (kind === "stamp" || isLineKind(kind) || isTextKind(kind)) {
    return [left, bottom, right, top];
  }
  const [dl, db, dr, dt] = inner ?? [width / 2, width / 2, width / 2, width / 2];
  const box = [left + dl, bottom + db, right - dr, top - dt];
  return box[2] > box[0] && box[3] > box[1] ? box : [left, bottom, right, top];
}

export function constrainEnd(kind: MarkupKind, [x1, y1]: Point, [x2, y2]: Point, shift: boolean): Point {
  if (!shift) {
    return [x2, y2];
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (isLineKind(kind)) {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    return [x1 + Math.cos(angle) * length, y1 + Math.sin(angle) * length];
  }
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return [x1 + Math.sign(dx || 1) * size, y1 + Math.sign(dy || 1) * size];
}

const opposite: Record<Corner, Corner> = { nw: "se", ne: "sw", sw: "ne", se: "nw" };

export function cornerPoint([left, bottom, right, top]: number[], corner: Corner): Point {
  return [corner.endsWith("w") ? left : right, corner.startsWith("n") ? top : bottom];
}

export function resizeBox(box: number[], corner: Corner, [x, y]: Point, keepAspect: boolean, minSize = 2) {
  const [ax, ay] = cornerPoint(box, opposite[corner]);
  let dx = x - ax;
  let dy = y - ay;
  if (keepAspect) {
    const width = box[2] - box[0];
    const height = box[3] - box[1];
    const scale = Math.max(Math.abs(dx) / (width || 1), Math.abs(dy) / (height || 1));
    dx = Math.sign(dx || 1) * width * scale;
    dy = Math.sign(dy || 1) * height * scale;
  }
  dx = Math.sign(dx || 1) * Math.max(minSize, Math.abs(dx));
  dy = Math.sign(dy || 1) * Math.max(minSize, Math.abs(dy));
  return normalizeBox([ax, ay, ax + dx, ay + dy]);
}

export function handlePoints(markup: Pick<Markup, "kind" | "box" | "line">): Array<[Handle, Point]> {
  if (isLineKind(markup.kind) && markup.line) {
    const [x1, y1, x2, y2] = markup.line;
    return [
      ["start", [x1, y1]],
      ["end", [x2, y2]],
    ];
  }
  if (isTextKind(markup.kind)) {
    return [];
  }
  return (["nw", "ne", "se", "sw"] as Corner[]).map((corner) => [corner, cornerPoint(markup.box, corner)]);
}

export function clampShift(box: number[], dx: number, dy: number, [vx1, vy1, vx2, vy2]: number[]): Point {
  const [left, bottom, right, top] = box;
  const clamp = (value: number, low: number, high: number) => (low > high ? 0 : Math.min(Math.max(value, low), high));
  return [clamp(dx, vx1 - left, vx2 - right), clamp(dy, vy1 - bottom, vy2 - top)];
}

const quarterTurns = (rotation: number) => ((Math.round(rotation / 90) % 4) + 4) % 4;

const toFrame = ([x, y]: Point, turns: number): Point => [[x, y], [y, -x], [-x, -y], [-y, x]][turns] as Point;
const fromFrame = ([u, v]: Point, turns: number): Point => [[u, v], [-v, u], [-u, -v], [v, -u]][turns] as Point;

function frameRect({ left, bottom, right, top }: Rect, turns: number): Rect {
  const [a, b] = [toFrame([left, bottom], turns), toFrame([right, top], turns)];
  return { left: Math.min(a[0], b[0]), right: Math.max(a[0], b[0]), bottom: Math.min(a[1], b[1]), top: Math.max(a[1], b[1]) };
}

const frameQuad = ({ left, bottom, right, top }: Rect, turns: number) =>
  [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ].flatMap((point) => fromFrame(point as Point, turns));

function quadTurns(quad: number[], pageTurns: number) {
  const [x1, y1, x2, y2] = quad;
  const [left, bottom, right, top] = quadsBox(quad);
  const [dx, dy] = [x2 - x1, y2 - y1];
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const edgeTurns = horizontal ? (dx >= 0 ? 0 : 2) : dy >= 0 ? 1 : 3;
  const [along, across] = horizontal ? [right - left, top - bottom] : [top - bottom, right - left];
  if ((dx || dy) && along >= across) {
    return edgeTurns;
  }
  return right - left >= top - bottom === (pageTurns % 2 === 0) ? pageTurns : edgeTurns;
}

export const textTurns = (cssAngle: number) => quarterTurns(-cssAngle);

export function orientedQuads(quads: number[], rotation = 0) {
  const oriented: number[] = [];
  for (let index = 0; index + 7 < quads.length; index += 8) {
    const quad = quads.slice(index, index + 8);
    const [left, bottom, right, top] = quadsBox(quad);
    const turns = quadTurns(quad, quarterTurns(rotation));
    oriented.push(...frameQuad(frameRect({ left, bottom, right, top }, turns), turns));
  }
  return oriented;
}

export function quadsFromRects(rects: Rect[], rotation = 0) {
  const turns = quarterTurns(rotation);
  const sorted = rects
    .filter((rect) => rect.right - rect.left > 0.5 && rect.top - rect.bottom > 0.5)
    .map((rect) => frameRect(rect, turns))
    .sort((a, b) => b.top - a.top || a.left - b.left);
  const lines: Rect[] = [];
  for (const rect of sorted) {
    const height = rect.top - rect.bottom;
    const line = lines.find((candidate) => {
      const overlap = Math.min(candidate.top, rect.top) - Math.max(candidate.bottom, rect.bottom);
      return overlap > Math.min(height, candidate.top - candidate.bottom) / 2;
    });
    if (line) {
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
      line.top = Math.max(line.top, rect.top);
      line.bottom = Math.min(line.bottom, rect.bottom);
    } else {
      lines.push({ ...rect });
    }
  }
  return lines.sort((a, b) => b.top - a.top || a.left - b.left).flatMap((line) => frameQuad(line, turns));
}

export const textMarkupWidth = (quads: number[]) => {
  const heights = [];
  for (let index = 0; index + 7 < quads.length; index += 8) {
    heights.push(Math.hypot(quads[index] - quads[index + 4], quads[index + 1] - quads[index + 5]));
  }
  const height = heights.length ? heights.reduce((sum, value) => sum + value, 0) / heights.length : 12;
  return Math.round(Math.min(3, Math.max(0.75, height / 14)) * 100) / 100;
};

export function textMarkupSegments(kind: "underline" | "strikeout", quads: number[], width: number) {
  const segments: number[][] = [];
  for (let index = 0; index + 7 < quads.length; index += 8) {
    const [x1, y1, x2, y2, x3, y3, x4, y4] = quads.slice(index, index + 8);
    if (kind === "strikeout") {
      segments.push([(x1 + x3) / 2, (y1 + y3) / 2, (x2 + x4) / 2, (y2 + y4) / 2]);
    } else {
      const height = Math.hypot(x1 - x3, y1 - y3) || 1;
      const lift = Math.max(width / 2, height * 0.08);
      const nx = ((x1 - x3) / height) * lift;
      const ny = ((y1 - y3) / height) * lift;
      segments.push([x3 + nx, y3 + ny, x4 + nx, y4 + ny]);
    }
  }
  return segments;
}

export function stampMatrix([left, bottom, right, top]: number[], rotation: number, gridWidth: number, gridHeight: number) {
  const turned = ((rotation % 360) + 360) % 180 === 90;
  const width = turned ? top - bottom : right - left;
  const height = turned ? right - left : top - bottom;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians) * 1e9) / 1e9;
  const sin = Math.round(Math.sin(radians) * 1e9) / 1e9;
  const sx = width / gridWidth;
  const sy = height / gridHeight;
  const [a, b, c, d] = [cos * sx, sin * sx, sin * sy, -cos * sy];
  const cx = (left + right) / 2;
  const cy = (bottom + top) / 2;
  return [a, b, c, d, cx - (a * gridWidth) / 2 - (c * gridHeight) / 2, cy - (b * gridWidth) / 2 - (d * gridHeight) / 2];
}

export function stampBox([x, y]: Point, aspect: number, height: number, rotation: number) {
  const width = height * aspect;
  const turned = ((rotation % 360) + 360) % 180 === 90;
  const [w, h] = turned ? [height, width] : [width, height];
  return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
}
