import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, PDFString, decodePDFRawStream } from "@cantoo/pdf-lib";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { newMarkup, type Markup, type MarkupKind } from "../src/lib/markup";
import { idOfRef, readMarkup } from "../src/lib/markupPdf";
import { outerRect } from "../src/lib/markupShapes";
import { writeAnnotations } from "../src/lib/notesPdf";
import { encryptPdf } from "../src/lib/pageEdits";
import { electricalStamps, iconStamps, reviewStamps } from "../src/lib/stampSymbols";
import { openPdf } from "./pdfjsNode";

const style = { color: [0.9, 0.2, 0.2], fill: false, width: 2, opacity: 0.8 };
const date = "D:20261107120000Z";

async function blank(pageCount = 2, rotate = 0) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index++) {
    doc.addPage([612, 792]).node.set(PDFName.of("Rotate"), PDFNumber.of(rotate));
  }
  return doc.save({ useObjectStreams: false });
}

const shape = (kind: MarkupKind, patch: Partial<Markup> = {}) => newMarkup({ id: `markup-${kind}`, pageIndex: 0, kind, box: [100, 500, 220, 580], ...patch }, style, date);

const allKinds = (): Markup[] => [
  shape("rectangle"),
  shape("ellipse", { fill: [0.9, 0.2, 0.2] }),
  shape("cloud"),
  shape("line", { line: [100, 400, 300, 450], box: [100, 400, 300, 450] }),
  shape("arrow", { line: [100, 300, 300, 350], box: [100, 300, 300, 350] }),
  shape("strikeout", { quads: [100, 220, 200, 220, 100, 208, 200, 208], box: [100, 208, 200, 220], width: 1 }),
  shape("underline", { quads: [100, 200, 200, 200, 100, 188, 200, 188], box: [100, 188, 200, 200], width: 1 }),
  shape("stamp", { stamp: "elec:receptacle-duplex", box: [300, 600, 336, 636], width: 0 }),
  shape("stamp", { id: "markup-review", stamp: "review:approved", stampDate: "11/07/2026", box: [300, 650, 420, 690], width: 0, color: [0.13, 0.55, 0.25] }),
];

async function pageAnnots(bytes: Uint8Array, pageIndex = 0) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.context.lookup(doc.getPage(pageIndex).ref, PDFDict);
  const annots = page.lookupMaybe(PDFName.of("Annots"), PDFArray);
  return { doc, entries: (annots?.asArray() ?? []).map((ref) => ({ ref: ref as PDFRef, dict: doc.context.lookup(ref, PDFDict) })) };
}

const nums = (dict: PDFDict, key: string) => dict.lookupMaybe(PDFName.of(key), PDFArray)?.asArray().map((value) => (value as PDFNumber).asNumber());
const nameOf = (dict: PDFDict, key: string) => dict.lookupMaybe(PDFName.of(key), PDFName)?.decodeText();
const textOf = (dict: PDFDict, key: string) => dict.lookupMaybe(PDFName.of(key), PDFString, PDFHexString)?.decodeText();

function appearanceText(dict: PDFDict) {
  const stream = dict.lookup(PDFName.of("AP"), PDFDict).lookup(PDFName.of("N"), PDFStream);
  return { stream, text: Buffer.from(stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents()).toString("latin1") };
}

async function withForeignAnnotations() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const { context } = doc;
  const popup = context.obj({ Type: "Annot", Subtype: "Popup", Rect: [300, 600, 480, 700] });
  const popupRef = context.register(popup);
  const square = context.register(
    context.obj({
      Type: "Annot",
      Subtype: "Square",
      Rect: [99, 99, 201, 201],
      RD: [1, 1, 1, 1],
      C: [0, 0, 1],
      BS: { W: 2, S: "D", D: [4, 2] },
      T: PDFHexString.fromText("Ann Author"),
      Contents: PDFHexString.fromText("Check this"),
      Popup: popupRef,
      CustomKey: "kept",
      F: 4,
    }),
  );
  popup.set(PDFName.of("Parent"), square);
  const reply = context.register(context.obj({ Type: "Annot", Subtype: "Text", Rect: [210, 190, 230, 210], IRT: square, Contents: PDFString.of("Agreed") }));
  const strike = context.register(context.obj({ Type: "Annot", Subtype: "StrikeOut", Rect: [50, 50, 150, 70], QuadPoints: [50, 70, 150, 70, 50, 50, 150, 50], C: [1, 0, 0] }));
  const link = context.register(context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 10, 10] }));
  doc.getPage(0).node.set(PDFName.of("Annots"), context.obj([square, popupRef, reply, strike, link]));
  return { bytes: await doc.save({ useObjectStreams: false }), square, popupRef, reply, strike, link };
}

describe("writing markup", () => {
  it("writes every kind as its own annotation with an appearance whose BBox is its Rect", async () => {
    const markup = allKinds();
    const bytes = await blank();
    const saved = await writeAnnotations(bytes, [], markup);
    expect(Buffer.from(saved.subarray(0, bytes.length)).equals(Buffer.from(bytes))).toBe(true);
    const { entries } = await pageAnnots(saved);
    expect(entries.map(({ dict }) => nameOf(dict, "Subtype"))).toEqual(["Square", "Circle", "Square", "Line", "Line", "StrikeOut", "Underline", "Stamp", "Stamp"]);
    entries.forEach(({ dict }, index) => {
      const rect = nums(dict, "Rect")!;
      expect(rect.map((value) => Math.round(value))).toEqual(outerRect(markup[index]).map((value) => Math.round(value)));
      expect(nums(appearanceText(dict).stream.dict, "BBox")).toEqual(rect);
      expect(nums(dict, "C")).toEqual(markup[index].color);
      expect(dict.lookup(PDFName.of("CA"), PDFNumber).asNumber()).toBe(0.8);
      expect(dict.lookup(PDFName.of("F"), PDFNumber).asNumber()).toBe(4);
      expect(textOf(dict, "M")).toBe(date);
      expect(textOf(dict, "NM")).toBe(markup[index].id);
    });
    const [square, circle, cloud, line, arrow, strike, underline, stamp, review] = entries.map(({ dict }) => dict);
    expect(square.has(PDFName.of("IC"))).toBe(false);
    expect(nums(circle, "IC")).toEqual([0.9, 0.2, 0.2]);
    expect(nameOf(cloud.lookup(PDFName.of("BE"), PDFDict), "S")).toBe("C");
    expect(nums(line, "L")).toEqual([100, 400, 300, 450]);
    expect(line.lookup(PDFName.of("LE"), PDFArray).asArray().map((value) => (value as PDFName).decodeText())).toEqual(["None", "None"]);
    expect(arrow.lookup(PDFName.of("LE"), PDFArray).asArray().map((value) => (value as PDFName).decodeText())).toEqual(["None", "OpenArrow"]);
    expect(nums(strike, "QuadPoints")).toEqual([100, 220, 200, 220, 100, 208, 200, 208]);
    expect(nums(underline, "QuadPoints")).toHaveLength(8);
    expect(nameOf(stamp, "Name")).toBe("Clumsy:elec:receptacle-duplex");
    expect(textOf(stamp, "Subj")).toBe("Duplex Receptacle");
    expect(textOf(review, "ClumsyDate")).toBe("11/07/2026");
    expect(appearanceText(review).text).toMatch(/\/HeBo [\d.]+ Tf/);
    expect(appearanceText(cloud).text.match(/ c\n/g)?.length).toBeGreaterThan(8);
  });

  it("reopens in pdf.js with every annotation drawn from its appearance", async () => {
    const saved = await writeAnnotations(await blank(), [], allKinds());
    const pdf = await openPdf(saved);
    const page = await pdf.getPage(1);
    const annotations = await page.getAnnotations();
    expect(annotations.map((annotation) => annotation.subtype)).toEqual(["Square", "Circle", "Square", "Line", "Line", "StrikeOut", "Underline", "Stamp", "Stamp"]);
    expect(annotations.every((annotation) => annotation.hasAppearance)).toBe(true);
    const { fnArray } = await page.getOperatorList({ annotationMode: 2 });
    expect(fnArray.filter((fn) => fn === OPS.beginAnnotation)).toHaveLength(9);
    expect(fnArray).toContain(OPS.showText);
  });

  it("reads back what it wrote", async () => {
    const markup = allKinds();
    const saved = await writeAnnotations(await blank(), [], markup);
    const read = readMarkup(await PDFDocument.load(saved));
    expect(read.map((entry) => entry.kind)).toEqual(markup.map((entry) => entry.kind));
    read.forEach((entry, index) => {
      expect(entry.fresh).toBe(false);
      expect(entry.box.map((value) => Math.round(value))).toEqual(markup[index].box.map((value) => Math.round(value)));
      expect(entry.color).toEqual(markup[index].color);
      expect(entry.opacity).toBe(0.8);
    });
    expect(read[3].line).toEqual([100, 400, 300, 450]);
    expect(read[4].endings).toEqual(["None", "OpenArrow"]);
    expect(read[1].fill).toEqual([0.9, 0.2, 0.2]);
    expect(read[7].stamp).toBe("elec:receptacle-duplex");
    expect(read[8].stampDate).toBe("11/07/2026");
  });

  it("doesn't duplicate anything when saved twice from the same original", async () => {
    const bytes = await blank();
    const markup = [shape("rectangle")];
    const once = await writeAnnotations(bytes, [], markup);
    const twice = await writeAnnotations(bytes, [], markup);
    expect((await pageAnnots(once)).entries).toHaveLength(1);
    expect((await pageAnnots(twice)).entries).toHaveLength(1);
  });

  it("writes every stamp with WinAnsi labels", async () => {
    const stamps = [...electricalStamps.map((entry) => entry.id), ...iconStamps, ...reviewStamps.map((entry) => entry.id)];
    const markup = stamps.map((stamp, index) => shape("stamp", { id: `stamp-${index}`, stamp, stampDate: stamp.startsWith("review:") ? "11/07/2026" : null, width: 0 }));
    const saved = await writeAnnotations(await blank(1), [], markup);
    const { entries } = await pageAnnots(saved);
    expect(entries).toHaveLength(stamps.length);
    const pdf = await openPdf(saved);
    expect(await pdf.getPage(1).then((page) => page.getAnnotations())).toHaveLength(stamps.length);
  });

  it("turns a stamp on a rotated page upright", async () => {
    const saved = await writeAnnotations(await blank(1, 90), [], [shape("stamp", { stamp: "review:void", rotation: 90, box: [300, 300, 340, 400], width: 0 })]);
    const { entries } = await pageAnnots(saved);
    const [dict] = entries.map((entry) => entry.dict);
    expect(dict.lookup(PDFName.of("Rotate"), PDFNumber).asNumber()).toBe(90);
    expect(appearanceText(dict).text).toMatch(/^0 0\.877\d* -1 0 300 300 cm$/m);
  });
});

describe("changing markup from the file", () => {
  it("moves, restyles, and redraws another app's annotation without losing its own keys", async () => {
    const { bytes, square, popupRef } = await withForeignAnnotations();
    const [found] = readMarkup(await PDFDocument.load(bytes));
    expect(found).toMatchObject({ id: idOfRef(square), kind: "rectangle", box: [100, 100, 200, 200], width: 2, dash: [4, 2], color: [0, 0, 1] });
    const moved: Markup = { ...found, box: [150, 120, 250, 220], color: [0, 0.5, 0], date };
    const saved = await writeAnnotations(bytes, [], [moved]);
    const { doc, entries } = await pageAnnots(saved);
    const dict = doc.context.lookup(square, PDFDict);
    expect(entries).toHaveLength(5);
    expect(nums(dict, "Rect")).toEqual([148, 118, 252, 222]);
    expect(nums(dict, "C")).toEqual([0, 0.5, 0]);
    expect(textOf(dict, "T")).toBe("Ann Author");
    expect(textOf(dict, "Contents")).toBe("Check this");
    expect(nameOf(dict, "CustomKey")).toBe("kept");
    const border = dict.lookup(PDFName.of("BS"), PDFDict);
    expect(nameOf(border, "S")).toBe("D");
    expect(nums(border, "D")).toEqual([4, 2]);
    expect(appearanceText(dict).text).toContain("[4 2] 0 d");
    expect(nums(doc.context.lookup(popupRef, PDFDict), "Rect")).toEqual([350, 620, 530, 720]);
  });

  it("deletes an annotation with its popup and replies and nothing else", async () => {
    const { bytes, square, strike, link } = await withForeignAnnotations();
    const [found] = readMarkup(await PDFDocument.load(bytes));
    const saved = await writeAnnotations(bytes, [], [{ ...found, deleted: true, date }]);
    const { entries } = await pageAnnots(saved);
    expect(entries.map((entry) => entry.ref)).toEqual([strike, link]);
    const pdf = await openPdf(saved);
    expect((await (await pdf.getPage(1)).getAnnotations()).map((annotation) => annotation.id)).not.toContain(idOfRef(square));
  });

  it("claims other apps' strikeouts but not their stamps or replies", async () => {
    const { bytes } = await withForeignAnnotations();
    expect(readMarkup(await PDFDocument.load(bytes)).map((entry) => entry.kind)).toEqual(["rectangle", "strikeout"]);
  });

  it("keeps another app's fill opaque and its transparent border invisible when moving it", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const cover = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Square", Rect: [100, 100, 200, 200], C: [], IC: [1, 1, 1], CA: 1, F: 4 }));
    doc.getPage(0).node.set(PDFName.of("Annots"), doc.context.obj([cover]));
    const bytes = await doc.save({ useObjectStreams: false });
    const [found] = readMarkup(await PDFDocument.load(bytes));
    expect(found).toMatchObject({ width: 0, fill: [1, 1, 1], fillAlpha: 1 });
    const saved = await writeAnnotations(bytes, [], [{ ...found, box: [101, 100, 201, 200], date }]);
    const reopened = await PDFDocument.load(saved);
    const dict = reopened.context.lookup(cover, PDFDict);
    const { stream, text } = appearanceText(dict);
    const gf = stream.dict.lookup(PDFName.of("Resources"), PDFDict).lookup(PDFName.of("ExtGState"), PDFDict).lookup(PDFName.of("GF"), PDFDict);
    expect(gf.lookup(PDFName.of("ca"), PDFNumber).asNumber()).toBe(1);
    expect(text).not.toMatch(/\bS\b/);
    expect(readMarkup(reopened)[0]).toMatchObject({ fillAlpha: 1, width: 0 });
  });

  it("keeps Clumsy's own light fill light after a round trip", async () => {
    const saved = await writeAnnotations(await blank(1), [], [shape("rectangle", { fill: [0.9, 0.2, 0.2] })]);
    expect(readMarkup(await PDFDocument.load(saved))[0].fillAlpha).toBeCloseTo(0.3);
  });

  it("reads counter-clockwise quads, old-style dashed borders, and leaves locked markup and dimension lines alone", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const { context } = doc;
    const strike = context.register(context.obj({ Type: "Annot", Subtype: "StrikeOut", Rect: [0, 0, 100, 10], QuadPoints: [0, 0, 100, 0, 100, 10, 0, 10], C: [1, 0, 0] }));
    const dashed = context.register(context.obj({ Type: "Annot", Subtype: "Square", Rect: [200, 200, 300, 300], C: [0, 0, 1], Border: [0, 0, 3, [5, 2]] }));
    const locked = context.register(context.obj({ Type: "Annot", Subtype: "Circle", Rect: [300, 300, 400, 400], C: [0, 0, 1], F: 128 }));
    const dimension = context.register(context.obj({ Type: "Annot", Subtype: "Line", Rect: [0, 400, 200, 440], L: [10, 410, 190, 410], LL: 20, Cap: true, C: [0, 0, 0] }));
    doc.getPage(0).node.set(PDFName.of("Annots"), context.obj([strike, dashed, locked, dimension]));
    const found = readMarkup(await PDFDocument.load(await doc.save({ useObjectStreams: false })));
    expect(found.map((entry) => entry.id)).toEqual([idOfRef(strike), idOfRef(dashed)]);
    expect(found[0].quads).toEqual([0, 10, 100, 10, 0, 0, 100, 0]);
    expect(found[1]).toMatchObject({ width: 3, dash: [5, 2] });
  });

  it("writes into a password-protected file", async () => {
    const encrypted = await encryptPdf(await blank(1), "secret");
    const saved = await writeAnnotations(encrypted, [], [shape("rectangle")], "secret");
    const pdf = await openPdf(saved);
    expect((await (await pdf.getPage(1)).getAnnotations()).map((annotation) => annotation.subtype)).toEqual(["Square"]);
  });
});
