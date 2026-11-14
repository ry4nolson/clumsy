const START = 0xd8;
const SCAN = 0xda;
const END = 0xd9;

const standalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
const frame = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
const metadata = (marker: number) => marker === 0xe1 || marker === 0xe2;

type Segment = { marker: number; start: number; end: number };

function segments(bytes: Uint8Array): Segment[] | null {
  if (bytes[0] !== 0xff || bytes[1] !== START) {
    return null;
  }
  const found: Segment[] = [];
  let at = 2;
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) {
      return null;
    }
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1;
    } else if (marker === SCAN || marker === END) {
      found.push({ marker, start: at, end: bytes.length });
      return found;
    } else if (standalone(marker)) {
      found.push({ marker, start: at, end: at + 2 });
      at += 2;
    } else {
      const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
      if (at + 3 >= bytes.length || end > bytes.length || end < at + 4) {
        return null;
      }
      found.push({ marker, start: at, end });
      at = end;
    }
  }
  return null;
}

export function jpegInfo(bytes: Uint8Array) {
  const sof = segments(bytes)?.find((segment) => frame(segment.marker));
  if (!sof || sof.end - sof.start < 10) {
    return null;
  }
  return { precision: bytes[sof.start + 4], components: bytes[sof.start + 9] };
}

export function jpegWithoutMetadata(bytes: Uint8Array) {
  const kept = segments(bytes)?.filter((segment) => !metadata(segment.marker));
  if (!kept) {
    return bytes;
  }
  const out = new Uint8Array(2 + kept.reduce((sum, segment) => sum + segment.end - segment.start, 0));
  out.set([0xff, START]);
  let at = 2;
  for (const segment of kept) {
    out.set(bytes.subarray(segment.start, segment.end), at);
    at += segment.end - segment.start;
  }
  return out;
}

function paeth(left: number, up: number, upLeft: number) {
  const guess = left + up - upLeft;
  const byLeft = Math.abs(guess - left);
  const byUp = Math.abs(guess - up);
  const byUpLeft = Math.abs(guess - upLeft);
  return byLeft <= byUp && byLeft <= byUpLeft ? left : byUp <= byUpLeft ? up : upLeft;
}

function unpredictPng(data: Uint8Array, rowBytes: number, pixelBytes: number) {
  const rows = Math.floor(data.length / (rowBytes + 1));
  const out = new Uint8Array(rows * rowBytes);
  for (let row = 0; row < rows; row += 1) {
    const from = row * (rowBytes + 1);
    const to = row * rowBytes;
    const kind = data[from];
    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= pixelBytes ? out[to + index - pixelBytes] : 0;
      const up = row ? out[to - rowBytes + index] : 0;
      const upLeft = row && index >= pixelBytes ? out[to - rowBytes + index - pixelBytes] : 0;
      const added = kind === 1 ? left : kind === 2 ? up : kind === 3 ? (left + up) >> 1 : kind === 4 ? paeth(left, up, upLeft) : 0;
      out[to + index] = data[from + 1 + index] + added;
    }
  }
  return out;
}

function unpredictTiff(data: Uint8Array, rowBytes: number, pixelBytes: number) {
  const out = data.slice();
  for (let row = 0; (row + 1) * rowBytes <= out.length; row += 1) {
    for (let index = row * rowBytes + pixelBytes; index < (row + 1) * rowBytes; index += 1) {
      out[index] += out[index - pixelBytes];
    }
  }
  return out;
}

export function unpredict(data: Uint8Array, predictor: number, columns: number, colors: number) {
  if (predictor <= 1) {
    return data;
  }
  return predictor === 2 ? unpredictTiff(data, columns * colors, colors) : unpredictPng(data, columns * colors, colors);
}

export function toRgba(pixels: Uint8Array, width: number, height: number, components: 1 | 3) {
  const count = width * height;
  if (pixels.length < count * components) {
    return null;
  }
  const rgba = new Uint8ClampedArray(count * 4);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const from = pixel * components;
    const to = pixel * 4;
    rgba[to] = pixels[from];
    rgba[to + 1] = pixels[components === 3 ? from + 1 : from];
    rgba[to + 2] = pixels[components === 3 ? from + 2 : from];
    rgba[to + 3] = 255;
  }
  return rgba;
}
