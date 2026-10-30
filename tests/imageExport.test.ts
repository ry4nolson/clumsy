import { describe, expect, it } from "vitest";
import {
  defaultExportOptions,
  exportTargets,
  normalizeExportOptions,
  pageImageName,
  pageImageNames,
  renderScale,
  safeFileName,
} from "../src/lib/imageExport";

describe("page image names", () => {
  it("names a single page without padding", () => {
    expect(pageImageNames("Lease.pdf", [2], 120, "png")).toEqual(["Lease - page 3.png"]);
    expect(pageImageName("Lease.PDF", 0, "jpeg")).toBe("Lease - page 1.jpg");
  });

  it("pads page numbers to the document's page count", () => {
    expect(pageImageNames("Lease.pdf", [0, 9], 12, "png")).toEqual(["Lease - page 01.png", "Lease - page 10.png"]);
    expect(pageImageNames("Lease.pdf", [0, 1], 9, "png")).toEqual(["Lease - page 1.png", "Lease - page 2.png"]);
    expect(pageImageNames("Big.pdf", [4, 311], 312, "jpeg")).toEqual(["Big - page 005.jpg", "Big - page 312.jpg"]);
  });

  it("keeps names safe for any file system", () => {
    expect(safeFileName('a/b\\c:d*e?"f<g>h|i')).toBe("a-b-c-d-e-f-g-h-i");
    expect(safeFileName("..hidden.")).toBe("hidden");
    expect(safeFileName("  ")).toBe("Untitled");
    expect(pageImageName("Q3: plan.pdf", 0, "png")).toBe("Q3- plan - page 1.png");
  });
});

describe("exportTargets", () => {
  it("exports the selection in page order", () => {
    expect(exportTargets([4, 1, 4], 10)).toEqual([1, 4]);
  });

  it("exports every page without a selection", () => {
    expect(exportTargets([], 3)).toEqual([0, 1, 2]);
    expect(exportTargets([7], 3)).toEqual([0, 1, 2]);
  });
});

describe("renderScale", () => {
  it("turns dots per inch into a scale over 72 points per inch", () => {
    expect(renderScale(612, 792, 72)).toBe(1);
    expect(renderScale(612, 792, 150)).toBeCloseTo(150 / 72);
    expect(renderScale(612, 792, 300)).toBeCloseTo(300 / 72);
  });

  it("stays within the canvas limits for huge pages", () => {
    const poster = renderScale(2384, 3370, 300);
    expect(2384 * poster * 3370 * poster).toBeLessThanOrEqual(2 ** 25 + 1);
    const banner = renderScale(14400, 200, 300);
    expect(14400 * banner).toBeLessThanOrEqual(16384);
  });
});

describe("normalizeExportOptions", () => {
  it("falls back to defaults for anything unexpected", () => {
    expect(normalizeExportOptions(null)).toEqual(defaultExportOptions);
    expect(normalizeExportOptions({ format: "gif", dpi: 96, quality: "high" })).toEqual(defaultExportOptions);
  });

  it("keeps valid choices and clamps quality", () => {
    expect(normalizeExportOptions({ format: "jpeg", dpi: 300, quality: 0.7 })).toEqual({ format: "jpeg", dpi: 300, quality: 0.7 });
    expect(normalizeExportOptions({ format: "jpeg", dpi: 72, quality: 4 }).quality).toBe(1);
    expect(normalizeExportOptions({ format: "jpeg", dpi: 72, quality: 0.1 }).quality).toBe(0.5);
  });
});
