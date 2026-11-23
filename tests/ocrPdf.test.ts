import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { addTextLayers, imageToPage, textLayerContent, visibleBox, type OcrWord } from "../src/lib/ocrPdf";
import { textLayerPdf } from "../src/lib/pageEdits";
import { openPdf } from "./pdfjsNode";

const word = (text: string, left: number, top: number, right: number, bottom: number, lineEnd = false): OcrWord => ({ text, left, top, right, bottom, lineEnd });

const WORDS = [word("Invoice", 300, 300, 600, 350), word("número", 620, 300, 900, 350), word("42", 920, 300, 1000, 350, true), word("日本語", 300, 400, 600, 450, true)];

async function layered(rotation = 0) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.setRotation(degrees(rotation));
  const turned = rotation % 180 !== 0;
  addTextLayers(doc, [{ pageIndex: 0, width: turned ? 3300 : 2550, height: turned ? 2550 : 3300, words: WORDS }]);
  return doc.save();
}

async function items(bytes: Uint8Array) {
  const page = await (await openPdf(bytes)).getPage(1);
  const viewport = page.getViewport({ scale: 2550 / 612 });
  const content = await page.getTextContent();
  return content.items.flatMap((item) => {
    if (!("str" in item) || !item.str.trim()) {
      return [];
    }
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    return [{ text: item.str, x: Math.round(x), y: Math.round(y) }];
  });
}

describe("imageToPage", () => {
  it("maps image corners onto the page for every rotation", () => {
    const box = { x: 10, y: 20, width: 600, height: 800 };
    const at = ([a, b, c, d, e, f]: number[], x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
    expect(at(imageToPage(box, 0, 1200), 0, 0)).toEqual([10, 820]);
    expect(at(imageToPage(box, 90, 1600), 0, 0)).toEqual([10, 20]);
    expect(at(imageToPage(box, 180, 1200), 0, 0)).toEqual([610, 20]);
    expect(at(imageToPage(box, 270, 1600), 0, 0)).toEqual([610, 820]);
  });
});

describe("addTextLayers", () => {
  it("writes text pdf.js reads back in order, including non-Latin text", async () => {
    const found = await items(await layered());
    expect(found.map((item) => item.text.trim()).join(" ").replace(/\s+/g, " ").trim()).toBe("Invoice número 42 日本語");
  });

  it.each([0, 90, 180, 270])("puts each word's baseline where the image had it on a page rotated %i", async (rotation) => {
    const found = await items(await layered(rotation));
    expect(found[0]).toMatchObject({ x: 300, y: 350 });
    expect(found.at(-1)).toMatchObject({ x: 300, y: 450 });
  });
});

describe("textLayerPdf", () => {
  it("adds text only to the pages it was given and keeps what the page drew", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]).drawText("Printed", { x: 72, y: 700, size: 12 });
    doc.addPage([612, 792]);
    const bytes = await textLayerPdf(await doc.save(), [{ pageIndex: 1, width: 2550, height: 3300, words: WORDS }]);
    const opened = await openPdf(bytes);
    const text = async (number: number) => (await (await opened.getPage(number)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join("");
    expect(await text(1)).toBe("Printed");
    expect(await text(2)).toContain("Invoice");
  });

  it("ignores pages that aren't in the document", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const bytes = await textLayerPdf(await doc.save(), [{ pageIndex: 4, width: 2550, height: 3300, words: WORDS }]);
    expect((await openPdf(bytes)).numPages).toBe(1);
  });
});

describe("page boxes", () => {
  it("uses the part of the crop box inside the media box, as pdf.js does", () => {
    const media = { x: 0, y: 0, width: 612, height: 792 };
    expect(visibleBox({ x: -50, y: -50, width: 750, height: 950 }, media)).toEqual(media);
    expect(visibleBox({ x: 36, y: 36, width: 540, height: 720 }, media)).toEqual({ x: 36, y: 36, width: 540, height: 720 });
    expect(visibleBox({ x: 700, y: 0, width: 50, height: 50 }, media)).toEqual(media);
  });

  it("ignores a rotation that isn't a quarter turn", () => {
    const box = { x: 0, y: 0, width: 600, height: 800 };
    expect(imageToPage(box, 45, 1200)).toEqual(imageToPage(box, 0, 1200));
    expect(imageToPage(box, -90, 1600)).toEqual(imageToPage(box, 270, 1600));
  });

  it("keeps invisible text mode from leaking into later content", () => {
    const content = textLayerContent(WORDS, imageToPage({ x: 0, y: 0, width: 612, height: 792 }, 0, 2550), "F1").split("\n");
    expect(content[0]).toBe("q");
    expect(content.at(-1)).toBe("Q");
  });

  it("places words by the visible box when the crop box overhangs the page", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.setCropBox(-50, -50, 750, 950);
    addTextLayers(doc, [{ pageIndex: 0, width: 2550, height: 3300, words: WORDS }]);
    const found = await items(await doc.save());
    expect(found[0]).toMatchObject({ x: 300, y: 350 });
  });
});
