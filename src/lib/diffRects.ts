export type Rect = { x: number; y: number; width: number; height: number };
export type PageRect = Rect & { page: number };

const MARKER_WIDTH = 0.004;

export function unionRect<T extends Rect>(a: T, b: Rect): T {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { ...a, x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

export function sameLine(a: PageRect, b: PageRect) {
  if (a.page !== b.page) {
    return false;
  }
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap >= Math.min(a.height, b.height) * 0.5;
}

export function mergeLineRects(rects: PageRect[]): PageRect[] {
  const merged: PageRect[] = [];
  for (const rect of rects) {
    const last = merged.at(-1);
    const gap = last ? Math.max(rect.x - (last.x + last.width), last.x - (rect.x + rect.width)) : 0;
    if (last && sameLine(last, rect) && gap < Math.max(last.height, rect.height) * 2) {
      merged[merged.length - 1] = unionRect(last, rect);
    } else {
      merged.push(rect);
    }
  }
  return merged;
}

export function markerRect(before: PageRect | undefined, after: PageRect | undefined): PageRect | null {
  if (before) {
    return { page: before.page, x: Math.min(before.x + before.width, 1 - MARKER_WIDTH), y: before.y, width: MARKER_WIDTH, height: before.height };
  }
  if (after) {
    return { page: after.page, x: Math.max(after.x - MARKER_WIDTH, 0), y: after.y, width: MARKER_WIDTH, height: after.height };
  }
  return null;
}

export function rotateRect<T extends Rect>(rect: T, rotation: number): T {
  const { x, y, width, height } = rect;
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { ...rect, x: 1 - y - height, y: x, width: height, height: width };
    case 180:
      return { ...rect, x: 1 - x - width, y: 1 - y - height };
    case 270:
      return { ...rect, x: y, y: 1 - x - width, width: height, height: width };
    default:
      return rect;
  }
}
