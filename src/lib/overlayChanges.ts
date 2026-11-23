export type Mask = { width: number; height: number; ink: Uint8Array };

export type PixelBox = { left: number; top: number; right: number; bottom: number };

export type ChangeOptions = { tolerance: number; cell: number; minPixels: number; margin: number; limit: number };

export const CHANGE_DPI = 75;
export const MAX_CHANGE_PIXELS = 6_000_000;

const defaults: ChangeOptions = { tolerance: 2, cell: 12, minPixels: 10, margin: 8, limit: 150 };
const INK_BELOW = 200;

export function inkMask(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Mask {
  const ink = new Uint8Array(width * height);
  for (let index = 0, at = 0; index < ink.length; index++, at += 4) {
    const alpha = rgba[at + 3] / 255;
    const luminance = (0.299 * rgba[at] + 0.587 * rgba[at + 1] + 0.114 * rgba[at + 2]) * alpha + 255 * (1 - alpha);
    ink[index] = luminance < INK_BELOW ? 1 : 0;
  }
  return { width, height, ink };
}

function spread({ width, height, ink }: Mask, radius: number) {
  if (radius <= 0) {
    return ink;
  }
  const across = new Uint8Array(ink.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let reach = -1;
    for (let x = 0; x < width; x++) {
      if (ink[row + x]) {
        for (let fill = Math.max(reach + 1, x - radius); fill <= Math.min(width - 1, x + radius); fill++) {
          across[row + fill] = 1;
        }
        reach = Math.min(width - 1, x + radius);
      }
    }
  }
  const both = new Uint8Array(ink.length);
  for (let x = 0; x < width; x++) {
    let reach = -1;
    for (let y = 0; y < height; y++) {
      if (across[y * width + x]) {
        for (let fill = Math.max(reach + 1, y - radius); fill <= Math.min(height - 1, y + radius); fill++) {
          both[fill * width + x] = 1;
        }
        reach = Math.min(height - 1, y + radius);
      }
    }
  }
  return both;
}

export function differenceMask(before: Mask, after: Mask, tolerance = defaults.tolerance): Mask {
  const width = Math.min(before.width, after.width);
  const height = Math.min(before.height, after.height);
  const nearBefore = spread(before, tolerance);
  const nearAfter = spread(after, tolerance);
  const ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const b = y * before.width + x;
      const a = y * after.width + x;
      ink[y * width + x] = (before.ink[b] && !nearAfter[a]) || (after.ink[a] && !nearBefore[b]) ? 1 : 0;
    }
  }
  return { width, height, ink };
}

const touches = (first: PixelBox, second: PixelBox) => first.left <= second.right && second.left <= first.right && first.top <= second.bottom && second.top <= first.bottom;

const union = (first: PixelBox, second: PixelBox): PixelBox => ({
  left: Math.min(first.left, second.left),
  top: Math.min(first.top, second.top),
  right: Math.max(first.right, second.right),
  bottom: Math.max(first.bottom, second.bottom),
});

function merged(boxes: PixelBox[]) {
  const result = [...boxes];
  for (let changed = true; changed; ) {
    changed = false;
    for (let first = 0; first < result.length && !changed; first++) {
      for (let second = first + 1; second < result.length; second++) {
        if (touches(result[first], result[second])) {
          result[first] = union(result[first], result[second]);
          result.splice(second, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return result;
}

export function changeBoxes(before: Mask, after: Mask, overrides: Partial<ChangeOptions> = {}): PixelBox[] {
  const options = { ...defaults, ...overrides };
  const difference = differenceMask(before, after, options.tolerance);
  const { width, height, ink } = difference;
  const columns = Math.ceil(width / options.cell);
  const rows = Math.ceil(height / options.cell);
  const counts = new Uint32Array(columns * rows);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / options.cell) * columns;
    for (let x = 0; x < width; x++) {
      if (ink[y * width + x]) {
        counts[row + Math.floor(x / options.cell)]++;
      }
    }
  }
  const seen = new Uint8Array(counts.length);
  const found: Array<{ box: PixelBox; pixels: number }> = [];
  for (let start = 0; start < counts.length; start++) {
    if (!counts[start] || seen[start]) {
      continue;
    }
    seen[start] = 1;
    const stack = [start];
    let pixels = 0;
    let box: PixelBox = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    while (stack.length) {
      const cell = stack.pop() as number;
      const column = cell % columns;
      const row = Math.floor(cell / columns);
      pixels += counts[cell];
      box = union(box, { left: column * options.cell, top: row * options.cell, right: Math.min(width, (column + 1) * options.cell), bottom: Math.min(height, (row + 1) * options.cell) });
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nextColumn = column + dx;
          const nextRow = row + dy;
          const next = nextRow * columns + nextColumn;
          if (nextColumn >= 0 && nextColumn < columns && nextRow >= 0 && nextRow < rows && counts[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (pixels >= options.minPixels) {
      found.push({ box, pixels });
    }
  }
  const padded = found.map(({ box }) => ({
    left: Math.max(0, box.left - options.margin),
    top: Math.max(0, box.top - options.margin),
    right: Math.min(width, box.right + options.margin),
    bottom: Math.min(height, box.bottom + options.margin),
  }));
  return merged(padded)
    .sort((first, second) => (second.right - second.left) * (second.bottom - second.top) - (first.right - first.left) * (first.bottom - first.top))
    .slice(0, options.limit)
    .sort((first, second) => first.top - second.top || first.left - second.left);
}

export const changeScale = (width: number, height: number) => Math.min(CHANGE_DPI / 72, Math.sqrt(MAX_CHANGE_PIXELS / Math.max(1, width * height)));
