import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "@cantoo/pdf-lib";
import { flattenedPdf } from "../src/lib/pageEdits";
import { printableBytes } from "../src/lib/print";

const key = PDFName.of;

async function marked(pageCount = 2) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.addPage([600, 800]);
    page.drawText(`Page ${index + 1}`, { x: 50, y: 750 });
    const appearance = doc.context.register(
      doc.context.stream("1 0 0 RG 4 w 2 2 96 46 re S", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 50] }),
    );
    const annotation = (subtype: string, flags: number, extra: Record<string, unknown> = {}) =>
      doc.context.register(doc.context.obj({ Type: "Annot", Subtype: subtype, Rect: [100, 600, 300, 700], F: flags, ...extra }));
    page.node.set(
      key("Annots"),
      doc.context.obj([
        annotation("Square", 4, { AP: { N: appearance } }),
        annotation("Link", 4),
        annotation("Square", 0, { AP: { N: appearance } }),
        annotation("Square", 6, { AP: { N: appearance } }),
        annotation("Circle", 4),
      ]),
    );
  }
  return doc.save();
}

function subtypes(doc: PDFDocument, page: number) {
  const annots = doc.getPage(page).node.lookup(key("Annots"), PDFArray);
  return annots.asArray().map((entry) => `${(doc.context.lookup(entry, PDFDict).lookup(key("Subtype")) as PDFName).decodeText()}:${doc.context.lookup(entry, PDFDict).lookup(key("F"))}`);
}

function content(doc: PDFDocument, page: number) {
  const contents = doc.getPage(page).node.lookup(key("Contents"));
  const streams = contents instanceof PDFArray ? contents.asArray().map((entry) => doc.context.lookup(entry)) : [contents];
  return streams.map((stream) => new TextDecoder().decode(stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : (stream as { getContents(): Uint8Array }).getContents())).join("\n");
}

describe("flattenedPdf", () => {
  it("draws printing annotations into the page and leaves the rest", async () => {
    const doc = await PDFDocument.load(await flattenedPdf(await marked(), null));
    expect(doc.getPageCount()).toBe(2);
    for (const page of [0, 1]) {
      expect(subtypes(doc, page)).toEqual(["Link:4", "Square:0", "Square:6", "Circle:4"]);
      const drawn = content(doc, page).match(/2 0 0 2 100 600 cm\s+\/FlatWidget\S* Do/g);
      expect(drawn).toHaveLength(1);
    }
  });

  it("keeps only the chosen pages", async () => {
    const doc = await PDFDocument.load(await flattenedPdf(await marked(3), [2]));
    expect(doc.getPageCount()).toBe(1);
    expect(content(doc, 0)).toContain("Do");
  });
});

describe("printableBytes with a flatten step", () => {
  it("uses it instead of extracting or decrypting", async () => {
    const calls: unknown[] = [];
    const flat = new Uint8Array([1]);
    const ops = {
      extract: async () => new Uint8Array(),
      decrypt: async () => new Uint8Array(),
      flatten: async (_bytes: Uint8Array, pages: number[] | null, password?: string) => {
        calls.push([pages, password]);
        return flat;
      },
    };
    expect(await printableBytes(new Uint8Array([9]), [1], "pw", ops)).toBe(flat);
    expect(await printableBytes(new Uint8Array([9]), null, null, ops)).toBe(flat);
    expect(calls).toEqual([[[1], "pw"], [null, undefined]]);
  });
});
