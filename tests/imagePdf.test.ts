import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "@cantoo/pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { groupRuns, imagesPdfName, pdfFromImages, type ImageDecoder } from "../src/lib/imagePdf";
import { jpeg, png } from "./imageFixtures";

const neverDecode: ImageDecoder = () => Promise.reject(new Error("should not decode"));

async function pages(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
    const text = streams
      .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
      .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
      .join("\n");
    return { ...page.getSize(), text };
  });
}

describe("pdfFromImages", () => {
  it("makes one page per image, sized to the image", async () => {
    const bytes = await pdfFromImages(
      [
        { name: "a.png", data: png(400, 300) },
        { name: "b.jpg", data: jpeg(3024, 4032) },
      ],
      neverDecode,
    );
    const [first, second] = await pages(bytes);
    expect(first).toMatchObject({ width: 400, height: 300 });
    expect(second.width).toBeCloseTo(594);
    expect(second.height).toBeCloseTo(792);
  });

  it("embeds a JPEG as-is and turns the page for its EXIF orientation", async () => {
    const original = jpeg(4032, 3024, 6);
    const bytes = await pdfFromImages([{ name: "phone.jpg", data: original }], neverDecode);
    const [page] = await pages(bytes);
    expect(page.width).toBeCloseTo(594);
    expect(page.height).toBeCloseTo(792);
    expect(page.text).toMatch(/^q\s+0 -792 594 0 0 792 cm\s+\/\S+ Do\s+Q/);
    const doc = await PDFDocument.load(bytes);
    const images = doc.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
    expect(images).toHaveLength(1);
    expect(images[0].dict.get(PDFName.of("Filter"))).toBe(PDFName.of("DCTDecode"));
    expect(Array.from(images[0].contents)).toEqual(Array.from(original));
  });

  it("decodes other formats through the decoder", async () => {
    const decode = vi.fn<ImageDecoder>(async () => ({ format: "png", data: png(20, 10) }));
    const heic = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    const [page] = await pages(await pdfFromImages([{ name: "IMG_1.HEIC", data: heic }], decode));
    expect(decode).toHaveBeenCalledOnce();
    expect(page).toMatchObject({ width: 20, height: 10 });
  });

  it("falls back to the decoder when a PNG or JPEG can't be embedded directly", async () => {
    const decode = vi.fn<ImageDecoder>(async () => ({ format: "jpeg", data: jpeg(30, 40) }));
    const broken = png(10, 10).slice(0, 20);
    const [page] = await pages(await pdfFromImages([{ name: "broken.png", data: broken }], decode));
    expect(decode).toHaveBeenCalledOnce();
    expect(page).toMatchObject({ width: 30, height: 40 });
  });
});

describe("imagesPdfName", () => {
  it("names the PDF after the first image", () => {
    expect(imagesPdfName(["IMG_0001.HEIC"])).toBe("IMG_0001.pdf");
    expect(imagesPdfName(["scan.page.tiff", "b.png", "c.png"])).toBe("scan.page and 2 more.pdf");
    expect(imagesPdfName([".png"])).toBe(".png.pdf");
  });
});

describe("groupRuns", () => {
  it("groups neighbors of the same kind and keeps order", () => {
    const runs = groupRuns(["a.pdf", "1.png", "2.jpg", "b.pdf", "3.png"], (name) => name.endsWith(".pdf"));
    expect(runs).toEqual([
      { key: true, items: ["a.pdf"] },
      { key: false, items: ["1.png", "2.jpg"] },
      { key: true, items: ["b.pdf"] },
      { key: false, items: ["3.png"] },
    ]);
  });
});
