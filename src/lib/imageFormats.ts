export type ImageType = "png" | "jpeg" | "other";

export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type Matrix = [number, number, number, number, number, number];

export const LETTER = { width: 612, height: 792 };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sniffImageType(bytes: Uint8Array): ImageType {
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return "png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  return "other";
}

function exifOrientation(view: DataView, start: number, end: number): Orientation {
  const order = view.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) {
    return 1;
  }
  const little = order === 0x4949;
  const ifd = start + view.getUint32(start + 4, little);
  if (ifd + 2 > end) {
    return 1;
  }
  const entries = view.getUint16(ifd, little);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) {
      return 1;
    }
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? (value as Orientation) : 1;
    }
  }
  return 1;
}

export function jpegOrientation(bytes: Uint8Array): Orientation {
  if (sniffImageType(bytes) !== "jpeg") {
    return 1;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return 1;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) {
      return 1;
    }
    const length = view.getUint16(offset + 2);
    const start = offset + 4;
    const end = Math.min(offset + 2 + length, bytes.length);
    const isExif = marker === 0xe1 && end - start > 14 && String.fromCharCode(...bytes.subarray(start, start + 6)) === "Exif\0\0";
    if (isExif) {
      return exifOrientation(view, start + 6, end);
    }
    offset += 2 + length;
  }
  return 1;
}

export const swapsSides = (orientation: Orientation) => orientation >= 5;

export function orientedSize(width: number, height: number, orientation: Orientation) {
  return swapsSides(orientation) ? { width: height, height: width } : { width, height };
}

export function orientationMatrix(orientation: Orientation, width: number, height: number): Matrix {
  const matrices: Record<Orientation, Matrix> = {
    1: [width, 0, 0, height, 0, 0],
    2: [-width, 0, 0, height, width, 0],
    3: [-width, 0, 0, -height, width, height],
    4: [width, 0, 0, -height, 0, height],
    5: [0, -height, -width, 0, width, height],
    6: [0, -height, width, 0, 0, height],
    7: [0, height, width, 0, 0, 0],
    8: [0, height, -width, 0, width, 0],
  };
  return matrices[orientation];
}

export function imagePageSize(width: number, height: number, box = LETTER) {
  const [boxWidth, boxHeight] = width > height ? [box.height, box.width] : [box.width, box.height];
  const scale = Math.min(1, boxWidth / width, boxHeight / height);
  return { width: width * scale, height: height * scale };
}

export function hasTransparency(rgba: Uint8ClampedArray) {
  for (let index = 3; index < rgba.length; index += 4) {
    if (rgba[index] !== 255) {
      return true;
    }
  }
  return false;
}

export const reencodeFormat = (transparent: boolean) => (transparent ? "png" : "jpeg");
