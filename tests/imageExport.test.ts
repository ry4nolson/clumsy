import { describe, expect, it } from "vitest";
import {
  defaultExportOptions,
  exportPixelSize,
  exportSummary,
  normalizeExportOptions,
  pageImageName,
  pageImageNames,
  pagesToExport,
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

describe("pagesToExport", () => {
  const context = { pageCount: 10, currentPage: 6, selection: [4, 1, 4], range: [8, 2, 99] };

  it("exports every page", () => {
    expect(pagesToExport("all", { ...context, pageCount: 3 })).toEqual([0, 1, 2]);
  });

  it("exports the current page", () => {
    expect(pagesToExport("current", context)).toEqual([6]);
  });

  it("exports the selection in page order", () => {
    expect(pagesToExport("selected", context)).toEqual([1, 4]);
  });

  it("exports a range in page order, dropping pages the document doesn't have", () => {
    expect(pagesToExport("range", context)).toEqual([2, 8]);
    expect(pagesToExport("range", { ...context, range: null })).toEqual([]);
  });
});

describe("exportSummary", () => {
  it("counts the images written", () => {
    expect(exportSummary(1, 1)).toBe("Exported 1 image.");
    expect(exportSummary(12, 12)).toBe("Exported 12 images.");
  });

  it("says when an export was cancelled partway", () => {
    expect(exportSummary(3, 12)).toBe("Exported 3 of 12 images before you cancelled.");
  });
});

describe("exportPixelSize", () => {
  it("gives the image size at a resolution", () => {
    expect(exportPixelSize(612, 792, 150)).toEqual({ width: 1275, height: 1650 });
    expect(exportPixelSize(612, 792, 72)).toEqual({ width: 612, height: 792 });
  });

  it("stays within the canvas limits", () => {
    const { width, height } = exportPixelSize(14400, 14400, 300);
    expect(width * height).toBeLessThanOrEqual(2 ** 25);
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
