import { describe, expect, it } from "vitest";
import { OPS, type PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { hideAnnotations } from "../src/lib/hiddenAnnotations";
import { newMarkup } from "../src/lib/markup";
import { writeAnnotations } from "../src/lib/notesPdf";
import { PDFDocument } from "@cantoo/pdf-lib";
import { openPdf } from "./pdfjsNode";

const style = { color: [1, 0, 0], fill: false, width: 2, opacity: 1 };

async function twoSquares() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const bytes = await doc.save({ useObjectStreams: false });
  const markup = [0, 1].map((index) => newMarkup({ id: `m${index}`, pageIndex: 0, kind: "rectangle", box: [100 + index * 200, 100, 200 + index * 200, 200] }, style, "D:20261107Z"));
  const pdf = await openPdf(await writeAnnotations(bytes, [], markup));
  const page = await pdf.getPage(1);
  const ids = (await page.getAnnotations()).map((annotation) => annotation.id as string);
  return { pdf, page, ids };
}

const drawn = async (page: PDFPageProxy, intent: "display" | "print" = "display") =>
  (await page.getOperatorList({ intent, annotationMode: 2 })).fnArray.filter((fn) => fn === OPS.beginAnnotation).length;

describe("hideAnnotations", () => {
  it("leaves hidden annotations out of display renders only", async () => {
    const { pdf, page, ids } = await twoSquares();
    expect(await drawn(page)).toBe(2);
    expect(hideAnnotations(pdf, new Set([ids[0]]))).toBe(true);
    expect(await drawn(page)).toBe(1);
    expect(await drawn(page, "print")).toBe(2);
  });

  it("draws them again once they're no longer hidden, and reports no change for the same set", async () => {
    const { pdf, page, ids } = await twoSquares();
    hideAnnotations(pdf, new Set(ids));
    expect(await drawn(page)).toBe(0);
    expect(hideAnnotations(pdf, new Set(ids))).toBe(false);
    expect(hideAnnotations(pdf, new Set())).toBe(true);
    expect(await drawn(page)).toBe(2);
  });

  it("writes nothing for hidden annotations on save", async () => {
    const { pdf, ids } = await twoSquares();
    const before = await pdf.saveDocument();
    hideAnnotations(pdf, new Set(ids));
    expect((await pdf.saveDocument()).length).toBe(before.length);
  });
});
