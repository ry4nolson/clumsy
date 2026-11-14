import { describe, expect, it } from "vitest";
import { compressLevel, compressLevels, formatBytes, savingLabel, targetSize, worthApplying, worthReplacing } from "../src/lib/compressPlan";
import { IDENTITY, drawnSize, multiply, placementsIn, type Matrix } from "../src/lib/contentPlacements";
import { jpegInfo, jpegWithoutMetadata, toRgba, unpredict } from "../src/lib/imagePixels";

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe("compress plan", () => {
  it("falls back to Balanced for an unknown level", () => {
    expect(compressLevel("small").dpi).toBe(96);
    expect(compressLevel("nope").id).toBe("balanced");
    expect(compressLevels.map((level) => level.dpi)).toEqual([200, 150, 96]);
  });

  it("downsamples to the resolution the drawn size needs", () => {
    expect(targetSize({ width: 2550, height: 3300 }, { width: 612, height: 792 }, 150)).toEqual({ width: 1275, height: 1650 });
    expect(targetSize({ width: 4000, height: 3000 }, { width: 144, height: 108 }, 150)).toEqual({ width: 300, height: 225 });
  });

  it("keeps the size when the image is already near or under the target, or its placement is unknown", () => {
    const image = { width: 1300, height: 1700 };
    expect(targetSize(image, { width: 612, height: 792 }, 150)).toBe(image);
    expect(targetSize(image, { width: 612, height: 792 }, 300)).toBe(image);
    expect(targetSize(image, null, 96)).toBe(image);
    expect(targetSize(image, { width: 0, height: 0 }, 96)).toBe(image);
  });

  it("uses the more demanding axis for a stretched image", () => {
    expect(targetSize({ width: 1000, height: 1000 }, { width: 72, height: 288 }, 100)).toEqual({ width: 400, height: 400 });
  });

  it("only takes results that are clearly smaller", () => {
    expect(worthReplacing(1000, 899)).toBe(true);
    expect(worthReplacing(1000, 950)).toBe(false);
    expect(worthApplying(1000, 979)).toBe(true);
    expect(worthApplying(1000, 990)).toBe(false);
    expect(worthApplying(1000, 1200)).toBe(false);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(640_300)).toBe("640 KB");
    expect(formatBytes(9_740_000)).toBe("9.7 MB");
    expect(formatBytes(171_678_176)).toBe("172 MB");
    expect(savingLabel(48_200_000, 9_700_000)).toBe("48.2 MB → 9.7 MB, 80% smaller");
  });
});

describe("content placements", () => {
  it("tracks the matrix through q, Q, and cm", () => {
    const found = placementsIn(bytesOf("q 612 0 0 792 0 0 cm /Im0 Do Q q 2 0 0 2 10 10 cm 50 0 0 25 0 0 cm /Im1 Do Q /Im2 Do"));
    expect(found.map((placement) => placement.name)).toEqual(["Im0", "Im1", "Im2"]);
    expect(drawnSize(found[0].matrix)).toEqual({ width: 612, height: 792 });
    expect(drawnSize(found[1].matrix)).toEqual({ width: 100, height: 50 });
    expect(found[2].matrix).toEqual(IDENTITY);
  });

  it("measures rotated placements", () => {
    const [placement] = placementsIn(bytesOf("0 300 -200 0 0 0 cm /Im0 Do"));
    expect(drawnSize(placement.matrix)).toEqual({ width: 300, height: 200 });
  });

  it("starts from the matrix it's given", () => {
    const base: Matrix = [0.5, 0, 0, 0.5, 0, 0];
    expect(drawnSize(placementsIn(bytesOf("100 0 0 100 0 0 cm /X Do"), base)[0].matrix)).toEqual({ width: 50, height: 50 });
    expect(multiply([2, 0, 0, 2, 1, 1], [1, 0, 0, 1, 10, 20])).toEqual([2, 0, 0, 2, 11, 21]);
  });

  it("ignores operators inside strings, comments, and inline images", () => {
    const content = "BT (q 9 0 0 9 0 0 cm /No Do \\) /No Do) Tj [(a) -3 <2f4e6f>] TJ ET % /No Do\nBI /W 2 /H 2 /BPC 8 /CS /G ID \x00 Do\xff EI 7 0 0 7 0 0 cm /Yes#20It Do";
    const found = placementsIn(Uint8Array.from(content, (char) => char.charCodeAt(0)));
    expect(found.map((placement) => placement.name)).toEqual(["Yes It"]);
    expect(drawnSize(found[0].matrix)).toEqual({ width: 7, height: 7 });
  });

  it("survives unbalanced and truncated content", () => {
    expect(placementsIn(bytesOf("Q Q 1 0 0 cm /A Do (unterminated"))).toHaveLength(1);
    expect(placementsIn(bytesOf("BI /W 1 ID abc"))).toEqual([]);
  });
});

const segment = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
const frame = (components: number, precision = 8) => segment(0xc0, [precision, 0, 16, 0, 16, components, ...Array(components * 3).fill(0)]);
const jpeg = (...parts: number[][]) => Uint8Array.from([0xff, 0xd8, ...parts.flat(), 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);

describe("jpeg segments", () => {
  it("reads precision and components from the frame header", () => {
    expect(jpegInfo(jpeg(segment(0xe0, [1, 2]), frame(3)))).toEqual({ precision: 8, components: 3 });
    expect(jpegInfo(jpeg(frame(4, 12)))).toEqual({ precision: 12, components: 4 });
    expect(jpegInfo(jpeg(segment(0xc4, [0, 0, 0, 0, 0, 0, 0, 0])))).toBeNull();
    expect(jpegInfo(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(jpegInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0xff]))).toBeNull();
  });

  it("drops EXIF and ICC segments and keeps the rest byte for byte", () => {
    const stripped = jpegWithoutMetadata(jpeg(segment(0xe0, [9]), segment(0xe1, [1, 2, 3]), segment(0xe2, [4, 5]), segment(0xee, [7]), frame(3)));
    expect(stripped).toEqual(jpeg(segment(0xe0, [9]), segment(0xee, [7]), frame(3)));
  });

  it("returns bytes it can't parse unchanged", () => {
    const junk = Uint8Array.from([0xff, 0xd8, 1, 2, 3]);
    expect(jpegWithoutMetadata(junk)).toBe(junk);
  });
});

describe("pixels", () => {
  it("undoes PNG predictors", () => {
    const rows = Uint8Array.from([1, 10, 20, 5, 5, 2, 1, 1, 1, 1, 3, 4, 4, 2, 2, 4, 1, 1, 1, 1, 0, 9, 8, 7, 6]);
    expect([...unpredict(rows, 15, 2, 2)]).toEqual([10, 20, 15, 25, 11, 21, 16, 26, 9, 14, 14, 22, 10, 15, 15, 23, 9, 8, 7, 6]);
  });

  it("undoes the TIFF predictor and passes unpredicted data through", () => {
    expect([...unpredict(Uint8Array.from([10, 1, 1, 250, 10, 1]), 2, 3, 1)]).toEqual([10, 11, 12, 250, 4, 5]);
    const plain = Uint8Array.from([1, 2, 3]);
    expect(unpredict(plain, 1, 3, 1)).toBe(plain);
  });

  it("expands gray and RGB to RGBA and refuses short data", () => {
    expect([...toRgba(Uint8Array.from([7, 9]), 2, 1, 1)!]).toEqual([7, 7, 7, 255, 9, 9, 9, 255]);
    expect([...toRgba(Uint8Array.from([1, 2, 3]), 1, 1, 3)!]).toEqual([1, 2, 3, 255]);
    expect(toRgba(Uint8Array.from([1, 2]), 1, 1, 3)).toBeNull();
  });
});
