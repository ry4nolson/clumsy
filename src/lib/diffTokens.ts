import { mergeLineRects, type PageRect } from "./diffRects";

export type TextItem = { str: string; transform: number[]; width: number; hasEOL?: boolean };
export type Viewport = { transform: number[]; width: number; height: number };
export type PageText = { items: TextItem[]; viewport: Viewport };
export type Token = { text: string; rects: PageRect[] };

type Placed = {
  item: TextItem;
  origin: [number, number];
  direction: [number, number];
  up: [number, number];
  length: number;
  size: number;
  viewport: Viewport;
};

const ASCENT = 0.8;
const DESCENT = 0.2;
const SOFT_HYPHEN = "­";

function multiply(m: number[], n: number[]) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function place(item: TextItem, viewport: Viewport): Placed {
  const tx = multiply(viewport.transform, item.transform);
  const [a, b, c, d] = viewport.transform;
  const angle = Math.atan2(tx[1], tx[0]);
  const direction: [number, number] = [Math.cos(angle), Math.sin(angle)];
  return {
    item,
    origin: [tx[4], tx[5]],
    direction,
    up: [direction[1], -direction[0]],
    length: item.width * Math.sqrt(Math.abs(a * d - b * c)),
    size: Math.hypot(tx[2], tx[3]),
    viewport,
  };
}

function partRect(placed: Placed, page: number, start: number, end: number): PageRect {
  const { origin, direction, up, length, size, viewport } = placed;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const along of [start * length, end * length]) {
    for (const across of [-DESCENT * size, ASCENT * size]) {
      xs.push((origin[0] + direction[0] * along + up[0] * across) / viewport.width);
      ys.push((origin[1] + direction[1] * along + up[1] * across) / viewport.height);
    }
  }
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const x = clamp(Math.min(...xs));
  const y = clamp(Math.min(...ys));
  return { page, x, y, width: clamp(Math.max(...xs)) - x, height: clamp(Math.max(...ys)) - y };
}

function breakBetween(previous: Placed, next: Placed): "none" | "space" | "line" {
  const endX = previous.origin[0] + previous.direction[0] * previous.length;
  const endY = previous.origin[1] + previous.direction[1] * previous.length;
  const dx = next.origin[0] - endX;
  const dy = next.origin[1] - endY;
  const along = dx * previous.direction[0] + dy * previous.direction[1];
  const across = dx * previous.up[0] + dy * previous.up[1];
  const size = Math.max(previous.size, next.size, 1e-6);
  if (Math.abs(across) > size * 0.5 || along < -size * 0.5) {
    return "line";
  }
  return along > size * 0.15 ? "space" : "none";
}

export function tokenizePages(pages: PageText[]): Token[] {
  const tokens: Token[] = [];
  let text = "";
  let rects: PageRect[] = [];
  let hyphenated = false;

  const flush = (lineEnd: boolean) => {
    if (!text || hyphenated) {
      return;
    }
    if (lineEnd && text.length > 1 && text.endsWith("-") && !text.endsWith("--")) {
      text = text.slice(0, -1);
      hyphenated = true;
      return;
    }
    tokens.push({ text: text.normalize("NFKC"), rects: mergeLineRects(rects) });
    text = "";
    rects = [];
  };

  pages.forEach(({ items, viewport }, page) => {
    let previous: Placed | null = null;
    for (const item of items) {
      const placed = place(item, viewport);
      if (previous) {
        const kind = breakBetween(previous, placed);
        if (kind !== "none") {
          flush(kind === "line");
        }
      }
      const length = item.str.length;
      let start: number | null = null;
      const closePart = (end: number) => {
        if (start !== null && end > start) {
          rects.push(partRect(placed, page, start / length, end / length));
        }
        start = null;
      };
      for (let index = 0; index < length; index++) {
        const char = item.str[index];
        if (char === SOFT_HYPHEN) {
          continue;
        }
        if (/\s/.test(char)) {
          closePart(index);
          flush(false);
          continue;
        }
        hyphenated = false;
        start ??= index;
        text += char;
      }
      closePart(length);
      if (item.hasEOL) {
        flush(true);
      }
      previous = placed;
    }
    flush(true);
  });
  if (hyphenated) {
    hyphenated = false;
    text += "-";
  }
  flush(false);
  return tokens;
}

export function tokenPage(token: Token) {
  return token.rects[0]?.page ?? 0;
}

export function rangeRects({ items, viewport }: PageText, page: number, ranges: Array<[start: number, length: number]>): PageRect[][] {
  const spans: Array<{ placed: Placed; start: number; end: number }> = [];
  let offset = 0;
  for (const item of items) {
    spans.push({ placed: place(item, viewport), start: offset, end: offset + item.str.length });
    offset += item.str.length;
  }
  return ranges.map(([start, length]) => {
    const rects: PageRect[] = [];
    for (const span of spans) {
      const from = Math.max(start, span.start);
      const to = Math.min(start + length, span.end);
      if (to > from) {
        const size = span.end - span.start;
        rects.push(partRect(span.placed, page, (from - span.start) / size, (to - span.start) / size));
      }
    }
    return mergeLineRects(rects);
  });
}
