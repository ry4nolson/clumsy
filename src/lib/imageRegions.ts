export type Rect = { x: number; y: number; width: number; height: number };

type Recorded = { coords: ArrayLike<number>; rotation: number };

const recorded = new WeakMap<object, Recorded>();

export function recordImageCoordinates(page: object, coords: ArrayLike<number> | null | undefined, rotation: number) {
  if (coords && !recorded.has(page)) {
    recorded.set(page, { coords, rotation });
  }
}

export function recordedImages(page: object) {
  return recorded.get(page) ?? null;
}

function rotatePoint([x, y]: [number, number], rotation: number): [number, number] {
  switch (rotation) {
    case 90:
      return [1 - y, x];
    case 180:
      return [1 - x, 1 - y];
    case 270:
      return [y, 1 - x];
    default:
      return [x, y];
  }
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function imageRects(coords: ArrayLike<number>, rotation: number): Rect[] {
  const delta = ((rotation % 360) + 360) % 360;
  const rects: Rect[] = [];
  for (let i = 0; i + 5 < coords.length; i += 6) {
    const [x1, y1, x2, y2, x3, y3] = Array.from({ length: 6 }, (_, j) => coords[i + j]);
    const corners = [
      [x1, y1],
      [x2, y2],
      [x3, y3],
      [x2 + x3 - x1, y2 + y3 - y1],
    ].map((point) => rotatePoint(point as [number, number], delta));
    const xs = corners.map(([x]) => clamp(x));
    const ys = corners.map(([, y]) => clamp(y));
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    if (width > 0 && height > 0) {
      rects.push({ x, y, width, height });
    }
  }
  return rects;
}
