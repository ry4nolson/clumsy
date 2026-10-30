import { describe, expect, it } from "vitest";
import {
  hasTransparency,
  imagePageSize,
  jpegOrientation,
  orientationMatrix,
  orientedSize,
  reencodeFormat,
  sniffImageType,
  type Orientation,
} from "../src/lib/imageFormats";
import { jpeg, png } from "./imageFixtures";

describe("sniffImageType", () => {
  it("goes by the bytes, not the name", () => {
    expect(sniffImageType(png(1, 1))).toBe("png");
    expect(sniffImageType(jpeg(1, 1))).toBe("jpeg");
    expect(sniffImageType(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]))).toBe("other");
    expect(sniffImageType(new Uint8Array())).toBe("other");
  });
});

describe("jpegOrientation", () => {
  it("reads the EXIF orientation in either byte order", () => {
    for (const orientation of [1, 3, 6, 8] as const) {
      expect(jpegOrientation(jpeg(4, 3, orientation))).toBe(orientation);
      expect(jpegOrientation(jpeg(4, 3, orientation, true))).toBe(orientation);
    }
  });

  it("treats missing, invalid, or unreadable orientation as upright", () => {
    expect(jpegOrientation(jpeg(4, 3))).toBe(1);
    expect(jpegOrientation(jpeg(4, 3, 9))).toBe(1);
    expect(jpegOrientation(jpeg(4, 3, 6).slice(0, 30))).toBe(1);
    expect(jpegOrientation(png(4, 3))).toBe(1);
  });

  it("works on a view into a larger buffer", () => {
    const bytes = jpeg(4, 3, 6);
    const padded = new Uint8Array(bytes.length + 7);
    padded.set(bytes, 7);
    expect(jpegOrientation(padded.subarray(7))).toBe(6);
  });
});

describe("orientation", () => {
  it("swaps width and height for the quarter turns", () => {
    expect(orientedSize(4000, 3000, 1)).toEqual({ width: 4000, height: 3000 });
    expect(orientedSize(4000, 3000, 3)).toEqual({ width: 4000, height: 3000 });
    expect(orientedSize(4000, 3000, 6)).toEqual({ width: 3000, height: 4000 });
    expect(orientedSize(4000, 3000, 8)).toEqual({ width: 3000, height: 4000 });
  });

  const apply = ([a, b, c, d, e, f]: number[], u: number, v: number) => [a * u + c * v + e, b * u + d * v + f];

  const storedTopLeft = { u: 0, v: 1 };
  const storedTopRight = { u: 1, v: 1 };
  const expected: Record<Orientation, { topLeft: number[]; topRight: number[] }> = {
    1: { topLeft: [0, 20], topRight: [10, 20] },
    2: { topLeft: [10, 20], topRight: [0, 20] },
    3: { topLeft: [10, 0], topRight: [0, 0] },
    4: { topLeft: [0, 0], topRight: [10, 0] },
    5: { topLeft: [0, 20], topRight: [0, 0] },
    6: { topLeft: [10, 20], topRight: [10, 0] },
    7: { topLeft: [10, 0], topRight: [10, 20] },
    8: { topLeft: [0, 0], topRight: [0, 20] },
  };

  it("draws the stored image's corners where each EXIF orientation puts them", () => {
    for (const [orientation, corners] of Object.entries(expected)) {
      const matrix = orientationMatrix(Number(orientation) as Orientation, 10, 20);
      expect(apply(matrix, storedTopLeft.u, storedTopLeft.v), `${orientation} top left`).toEqual(corners.topLeft);
      expect(apply(matrix, storedTopRight.u, storedTopRight.v), `${orientation} top right`).toEqual(corners.topRight);
    }
  });

  it("covers the whole page for every orientation", () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const matrix = orientationMatrix(orientation, 10, 20);
      const corners = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([u, v]) => apply(matrix, u, v).join(","));
      expect(new Set(corners)).toEqual(new Set(["0,0", "10,0", "0,20", "10,20"]));
    }
  });
});

describe("imagePageSize", () => {
  it("keeps small images at their own size, one pixel to a point", () => {
    expect(imagePageSize(400, 300)).toEqual({ width: 400, height: 300 });
    expect(imagePageSize(16, 16)).toEqual({ width: 16, height: 16 });
  });

  it("shrinks big portrait images to fit within Letter", () => {
    expect(imagePageSize(2550, 3300)).toEqual({ width: 612, height: 792 });
    const photo = imagePageSize(3024, 4032);
    expect(photo.width).toBeCloseTo(594);
    expect(photo.height).toBeCloseTo(792);
  });

  it("fits landscape images within landscape Letter", () => {
    const photo = imagePageSize(4032, 3024);
    expect(photo.width).toBeCloseTo(792);
    expect(photo.height).toBeCloseTo(594);
    const panorama = imagePageSize(12000, 2000);
    expect(panorama.width).toBeCloseTo(792);
    expect(panorama.height).toBeCloseTo(132);
  });

  it("keeps the aspect ratio", () => {
    for (const [width, height] of [
      [5000, 1000],
      [1000, 5000],
      [999, 1001],
    ]) {
      const size = imagePageSize(width, height);
      expect(size.width / size.height).toBeCloseTo(width / height);
    }
  });
});

describe("re-encoding", () => {
  it("keeps transparency as PNG and everything else as JPEG", () => {
    expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false);
    expect(hasTransparency(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254]))).toBe(true);
    expect(reencodeFormat(true)).toBe("png");
    expect(reencodeFormat(false)).toBe("jpeg");
  });
});
