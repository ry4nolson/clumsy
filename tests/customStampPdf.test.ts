import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, PDFString, decodePDFRawStream } from "@cantoo/pdf-lib";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { MAX_RECONSTRUCTED_PIXELS, readCustomStamps, type FileStamp } from "../src/lib/customStampPdf";
import { registerStamps, setLibrary, type CustomStamp } from "../src/lib/customStamps";
import { movedMarkup, newMarkup, type Markup } from "../src/lib/markup";
import { idOfRef, readMarkup } from "../src/lib/markupPdf";
import { writeAnnotations } from "../src/lib/notesPdf";
import { bytesToBase64 } from "../src/lib/webviewPolyfills";
import { jpeg, rgbaPng } from "./imageFixtures";
import { openPdf } from "./pdfjsNode";

const style = { color: [0.9, 0.2, 0.2], fill: false, width: 2, opacity: 0.8 };
const date = "D:20261116120000Z";

const pixels = [255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 255, 255, 255, 255];
const logo: CustomStamp = { id: "custom:11111111-1111-4111-8111-111111111111", name: "Logo", kind: "image", mime: "image/png", data: bytesToBase64(rgbaPng(2, 2, pixels)), width: 2, height: 2 };
const photo: CustomStamp = { id: "custom:22222222-2222-4222-8222-222222222222", name: "Photo", kind: "image", mime: "image/jpeg", data: bytesToBase64(jpeg(4, 2)), width: 4, height: 2 };
const words: CustomStamp = { id: "custom:33333333-3333-4333-8333-333333333333", name: "Field Verify", kind: "text", text: "FIELD VERIFY", color: [0, 0.4, 0], date: true };

async function blank() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return doc.save({ useObjectStreams: false });
}

const stamp = (id: string, stampId: string, box: number[], patch: Partial<Markup> = {}) =>
  newMarkup({ id, pageIndex: 0, kind: "stamp", box, stamp: stampId, width: 0, ...patch }, style, date);

async function annots(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.context.lookup(doc.getPage(0).ref, PDFDict);
  const list = page.lookupMaybe(PDFName.of("Annots"), PDFArray)?.asArray() ?? [];
  return { doc, entries: list.map((ref) => ({ ref: ref as PDFRef, dict: doc.context.lookup(ref, PDFDict) })) };
}

function appearance(dict: PDFDict) {
  const stream = dict.lookup(PDFName.of("AP"), PDFDict).lookup(PDFName.of("N"), PDFStream);
  const text = Buffer.from(stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents()).toString("latin1");
  return { stream, text, resources: stream.dict.lookup(PDFName.of("Resources"), PDFDict) };
}

const textOf = (dict: PDFDict, key: string) => dict.lookupMaybe(PDFName.of(key), PDFString, PDFHexString)?.decodeText();
const pixelsOf = (stamp: FileStamp | undefined) => (stamp?.kind === "pixels" ? [...stamp.rgba] : null);

describe("custom stamps in PDFs", () => {
  it("writes an image stamp as a Clumsy stamp whose appearance draws the image", async () => {
    const saved = await writeAnnotations(await blank(), [], [stamp("markup-logo", logo.id, [100, 100, 196, 148])], "", [logo]);
    const { doc, entries } = await annots(saved);
    const [{ dict }] = entries;
    expect(dict.lookup(PDFName.of("Name"), PDFName).decodeText()).toBe(`Clumsy:${logo.id}`);
    expect(textOf(dict, "Subj")).toBe("Logo");
    const { text, resources } = appearance(dict);
    expect(text).toContain("/Im0 Do");
    const image = dict.get(PDFName.of("ClumsyStampImage")) as PDFRef;
    expect(resources.lookup(PDFName.of("XObject"), PDFDict).get(PDFName.of("Im0"))).toBe(image);
    const xobject = doc.context.lookup(image, PDFRawStream);
    expect(xobject.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber()).toBe(2);
    expect(xobject.dict.has(PDFName.of("SMask"))).toBe(true);
    const page = await (await openPdf(saved)).getPage(1);
    const { fnArray } = await page.getOperatorList({ annotationMode: 2 });
    expect(fnArray).toContain(OPS.beginAnnotation);
    expect(fnArray.some((fn) => fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject)).toBe(true);
  });

  it("stores one image for every placement, across saves too", async () => {
    const first = await writeAnnotations(await blank(), [], [stamp("a", logo.id, [100, 100, 150, 150]), stamp("b", logo.id, [200, 100, 250, 150])], "", [logo]);
    const second = await writeAnnotations(first, [], [stamp("c", logo.id, [300, 100, 350, 150])], "", [logo]);
    const { entries } = await annots(second);
    const images = new Set(entries.map(({ dict }) => (dict.get(PDFName.of("ClumsyStampImage")) as PDFRef).toString()));
    expect(entries).toHaveLength(3);
    expect(images.size).toBe(1);
  });

  it("reads custom stamps back from a file, transparency included", async () => {
    const markup = [
      stamp("png", logo.id, [100, 100, 150, 150]),
      stamp("jpg", photo.id, [200, 100, 300, 150]),
      stamp("txt", words.id, [100, 300, 260, 340], { stampDate: "11/16/2026", color: [0, 0.4, 0] }),
    ];
    const saved = await writeAnnotations(await blank(), [], markup, "", [logo, photo, words]);
    const found = new Map(readCustomStamps(await PDFDocument.load(saved)).map((entry) => [entry.id, entry]));
    expect(pixelsOf(found.get(logo.id))).toEqual(pixels);
    expect(found.get(logo.id)?.name).toBe("Logo");
    expect(found.get(photo.id)).toMatchObject({ kind: "image", mime: "image/jpeg", data: photo.data, width: 4, height: 2 });
    expect(found.get(words.id)).toMatchObject({ kind: "text", text: "FIELD VERIFY", name: "Field Verify" });
    const read = readMarkup(await PDFDocument.load(saved));
    expect(read.map((entry) => entry.stamp)).toEqual([logo.id, photo.id, words.id]);
    expect(read[2].stampDate).toBe("11/16/2026");
  });

  it("redraws a moved custom stamp from a document's copy without a new image", async () => {
    const saved = await writeAnnotations(await blank(), [], [stamp("png", logo.id, [100, 100, 150, 150])], "", [logo]);
    const before = await annots(saved);
    const imageRef = before.entries[0].dict.get(PDFName.of("ClumsyStampImage"));
    const [fileStamp] = readMarkup(before.doc);
    const moved = movedMarkup({ ...fileStamp, id: idOfRef(before.entries[0].ref) }, 50, 0, date);
    const resaved = await writeAnnotations(saved, [], [moved], "", [logo]);
    const { entries } = await annots(resaved);
    expect(entries[0].dict.get(PDFName.of("ClumsyStampImage"))).toBe(imageRef);
    expect(entries[0].dict.lookup(PDFName.of("Rect"), PDFArray).asArray().map((value) => (value as PDFNumber).asNumber())).toEqual([150, 100, 200, 150]);
    expect(appearance(entries[0].dict).text).toContain("/Im0 Do");
  });

  it("keeps the appearance of a custom stamp this machine doesn't have", async () => {
    const stranger: CustomStamp = { ...logo, id: "custom:44444444-4444-4444-8444-444444444444" };
    registerStamps([stranger]);
    const saved = await writeAnnotations(await blank(), [], [stamp("png", stranger.id, [100, 100, 150, 150])], "", [stranger]);
    const before = await annots(saved);
    const original = before.entries[0].dict.lookup(PDFName.of("AP"), PDFDict).get(PDFName.of("N"))?.toString();
    const unknown = { ...readMarkup(before.doc)[0], id: idOfRef(before.entries[0].ref), stamp: "custom:55555555-5555-4555-8555-555555555555" };
    const resaved = await writeAnnotations(saved, [], [movedMarkup(unknown, 10, 10, date)]);
    const { entries } = await annots(resaved);
    expect(entries[0].dict.lookup(PDFName.of("AP"), PDFDict).get(PDFName.of("N"))?.toString()).toBe(original);
    expect(entries[0].dict.lookup(PDFName.of("Rect"), PDFArray).asArray().map((value) => (value as PDFNumber).asNumber())).toEqual([110, 110, 160, 160]);
  });

  it("writes a custom text stamp in its color with Helvetica Bold", async () => {
    setLibrary([words]);
    const saved = await writeAnnotations(await blank(), [], [stamp("txt", words.id, [100, 300, 260, 340], { stampDate: "11/16/2026", color: words.color })], "", [words]);
    const { entries } = await annots(saved);
    const { text, resources } = appearance(entries[0].dict);
    expect(textOf(entries[0].dict, "ClumsyStampText")).toBe("FIELD VERIFY");
    expect(resources.lookup(PDFName.of("Font"), PDFDict).has(PDFName.of("HeBo"))).toBe(true);
    expect(text).toContain("0 0.4 0 rg");
  });

  it("skips stamps the window already has and stops at the pixel budget", async () => {
    const saved = await writeAnnotations(await blank(), [], [stamp("png", logo.id, [100, 100, 150, 150]), stamp("txt", words.id, [100, 300, 260, 340])], "", [logo, words]);
    const doc = await PDFDocument.load(saved);
    expect(readCustomStamps(doc, [logo.id]).map((entry) => entry.id)).toEqual([words.id]);
    const page = doc.context.lookup(doc.getPage(0).ref, PDFDict);
    const image = doc.context.lookup(page.lookup(PDFName.of("Annots"), PDFArray).lookup(0, PDFDict).get(PDFName.of("ClumsyStampImage")) as PDFRef, PDFRawStream);
    image.dict.set(PDFName.of("Width"), PDFNumber.of(4096));
    image.dict.set(PDFName.of("Height"), PDFNumber.of(4096));
    expect(4096 * 4096).toBeLessThanOrEqual(MAX_RECONSTRUCTED_PIXELS);
    const big = (id: string) => doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Stamp", Rect: [0, 0, 10, 10], Name: `Clumsy:${id}`, ClumsyStampImage: page.lookup(PDFName.of("Annots"), PDFArray).lookup(0, PDFDict).get(PDFName.of("ClumsyStampImage")) as PDFRef }));
    page.lookup(PDFName.of("Annots"), PDFArray).push(big("custom:66666666-6666-4666-8666-666666666666"));
    const read = readCustomStamps(doc).map((entry) => entry.id);
    expect(read).not.toContain("custom:66666666-6666-4666-8666-666666666666");
    expect(read).toContain(words.id);
  });

  it("neither reads nor reuses a stamp image reference that isn't an image", async () => {
    const saved = await writeAnnotations(await blank(), [], [stamp("png", logo.id, [100, 100, 150, 150])], "", [logo]);
    const doc = await PDFDocument.load(saved);
    const dict = doc.context.lookup(doc.context.lookup(doc.getPage(0).ref, PDFDict).lookup(PDFName.of("Annots"), PDFArray).get(0) as PDFRef, PDFDict);
    const content = doc.context.register(doc.context.flateStream("0 0 m 10 10 l S", {}));
    dict.set(PDFName.of("ClumsyStampImage"), content);
    const tampered = await doc.save({ useObjectStreams: false });
    expect(readCustomStamps(await PDFDocument.load(tampered))).toEqual([]);
    const resaved = await writeAnnotations(tampered, [], [stamp("again", logo.id, [300, 100, 350, 150])], "", [logo]);
    const { entries } = await annots(resaved);
    expect(String(entries[1].dict.get(PDFName.of("ClumsyStampImage")))).not.toBe(content.toString());
  });

  it("still saves everything else when a stamp's image can't be decoded", async () => {
    const broken: CustomStamp = { ...logo, id: "custom:77777777-7777-4777-8777-777777777777", data: "iVBORw0KGgoAAAA" };
    const saved = await writeAnnotations(await blank(), [], [stamp("bad", broken.id, [100, 100, 150, 150]), stamp("txt", words.id, [100, 300, 260, 340])], "", [broken, words]);
    const { entries } = await annots(saved);
    expect(entries).toHaveLength(2);
    expect(entries[0].dict.has(PDFName.of("ClumsyStampImage"))).toBe(false);
    expect(textOf(entries[1].dict, "ClumsyStampText")).toBe("FIELD VERIFY");
  });
});
