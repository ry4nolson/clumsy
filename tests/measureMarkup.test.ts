import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, PDFString, decodePDFRawStream } from "@cantoo/pdf-lib";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { isClaimedShape, mayBeMarkup, movedMarkup, newMarkup, reshapedMarkup, type Markup, type MarkupKind, type MeasureSettings } from "../src/lib/markup";
import { idOfRef, readMarkup } from "../src/lib/markupPdf";
import { outerRect } from "../src/lib/markupShapes";
import { fullSize, sameScale, scalePresets } from "../src/lib/measure";
import { captionCorners, captionPlacement, captionText } from "../src/lib/measureMarkup";
import { measureDict, setPageScale } from "../src/lib/measurePdf";
import { writeAnnotations } from "../src/lib/notesPdf";
import { openPdf } from "./pdfjsNode";

const eighth = scalePresets.find((scale) => scale.label === `1/8" = 1'-0"`)!;
const settings: MeasureSettings = { scale: eighth, format: { unit: "ft-in", precision: 16 } };
const style = { color: [0.1, 0.3, 0.8], fill: false, width: 1.5, opacity: 1 };
const date = "D:20261115120000Z";

const measure = (kind: MarkupKind, points: number[], patch: Partial<Markup> = {}) => {
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const geometry = kind === "measure-length" ? { line: points } : { vertices: points };
  return newMarkup({ id: `markup-${kind}`, pageIndex: 0, kind, box, measure: settings, ...geometry, ...patch }, style, date);
};

const allMeasurements = () => [
  measure("measure-length", [100, 100, 400, 100]),
  measure("measure-path", [100, 200, 400, 200, 400, 500]),
  measure("measure-area", [100, 550, 400, 550, 400, 700, 100, 700], { fill: style.color }),
];

async function blank(rotate = 0) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]).node.set(PDFName.of("Rotate"), PDFNumber.of(rotate));
  return doc.save({ useObjectStreams: false });
}

async function pageAnnots(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.context.lookup(doc.getPage(0).ref, PDFDict);
  return (page.lookupMaybe(PDFName.of("Annots"), PDFArray)?.asArray() ?? []).map((ref) => doc.context.lookup(ref, PDFDict));
}

const nums = (dict: PDFDict, key: string) => dict.lookupMaybe(PDFName.of(key), PDFArray)?.asArray().map((value) => (value as PDFNumber).asNumber());
const nameOf = (dict: PDFDict, key: string) => dict.lookupMaybe(PDFName.of(key), PDFName)?.decodeText();
const textOf = (dict: PDFDict, key: string) => dict.lookupMaybe(PDFName.of(key), PDFString, PDFHexString)?.decodeText();

function appearance(dict: PDFDict) {
  const stream = dict.lookup(PDFName.of("AP"), PDFDict).lookup(PDFName.of("N"), PDFStream);
  return { stream, text: Buffer.from(stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents()).toString("latin1") };
}

describe("measure markup model", () => {
  it("gives a length dimension arrows and moves and reshapes vertices", () => {
    expect(measure("measure-length", [0, 0, 10, 0]).endings).toEqual(["OpenArrow", "OpenArrow"]);
    const path = measure("measure-path", [0, 0, 10, 0, 10, 10]);
    expect(movedMarkup(path, 1, 2, date)).toMatchObject({ vertices: [1, 2, 11, 2, 11, 12], box: [1, 2, 11, 12] });
    expect(reshapedMarkup(path, { vertices: [0, 0, 20, 5] }, date)).toMatchObject({ vertices: [0, 0, 20, 5], box: [0, 0, 20, 5] });
  });

  it("claims only polygons and polylines that are measurements", () => {
    expect(isClaimedShape({ annotationType: 7, it: "PolygonDimension" })).toBe(true);
    expect(isClaimedShape({ annotationType: 8, it: "PolyLineDimension" })).toBe(true);
    expect(isClaimedShape({ annotationType: 7, it: "PolygonCloud" })).toBe(false);
    expect(isClaimedShape({ annotationType: 8, it: "PolygonDimension" })).toBe(false);
    expect(isClaimedShape({ annotationType: 7 })).toBe(false);
    expect(isClaimedShape({ annotationType: 7, it: "PolygonDimension", inReplyTo: "12R" })).toBe(false);
    expect(mayBeMarkup({ annotationType: 7, it: "PolygonDimension" })).toBe(true);
    expect(mayBeMarkup({ annotationType: 13 })).toBe(true);
    expect(mayBeMarkup({ annotationType: 2 })).toBe(false);
  });

  it("captions each kind from its geometry and scale", () => {
    const [length, path, area] = allMeasurements();
    expect(captionText(length)).toBe(`33' 4"`);
    expect(captionText(path)).toBe(`66' 8"`);
    expect(captionText(area)).toBe("555.56 sq ft");
    expect(captionText({ ...length, measure: null })).toBe(`0' 4 3/16"`);
  });

  it("keeps the caption inside the annotation's rectangle", () => {
    for (const markup of allMeasurements()) {
      const [left, bottom, right, top] = outerRect(markup);
      for (const [x, y] of captionCorners(markup)) {
        expect(x).toBeGreaterThanOrEqual(left);
        expect(x).toBeLessThanOrEqual(right);
        expect(y).toBeGreaterThanOrEqual(bottom);
        expect(y).toBeLessThanOrEqual(top);
      }
    }
    const [length] = allMeasurements();
    expect(outerRect(length)[3]).toBeGreaterThan(length.box[3] + 10);
  });

  it("turns an area caption to read across a rotated page", () => {
    const area = measure("measure-area", [0, 0, 100, 0, 100, 100, 0, 100], { rotation: 90 });
    expect(captionPlacement(area).angle).toBeCloseTo(Math.PI / 2, 9);
    expect(captionPlacement({ ...area, rotation: 0 })).toMatchObject({ angle: 0, centered: true });
  });
});

describe("writing measurements", () => {
  it("writes each kind with its intent, measure, caption, and an appearance whose BBox is its Rect", async () => {
    const markup = allMeasurements();
    const dicts = await pageAnnots(await writeAnnotations(await blank(), [], markup));
    expect(dicts.map((dict) => [nameOf(dict, "Subtype"), nameOf(dict, "IT"), textOf(dict, "Subj")])).toEqual([
      ["Line", "LineDimension", "Length"],
      ["PolyLine", "PolyLineDimension", "Perimeter"],
      ["Polygon", "PolygonDimension", "Area"],
    ]);
    expect(dicts.map((dict) => textOf(dict, "Contents"))).toEqual([`33' 4"`, `66' 8"`, "555.56 sq ft"]);
    dicts.forEach((dict, index) => {
      const rect = nums(dict, "Rect")!;
      expect(rect.map(Math.round)).toEqual(outerRect(markup[index]).map(Math.round));
      expect(nums(appearance(dict).stream.dict, "BBox")).toEqual(rect);
      expect(dict.has(PDFName.of("RD"))).toBe(false);
      expect(dict.lookup(PDFName.of("Measure"), PDFDict).has(PDFName.of("X"))).toBe(true);
      const fonts = appearance(dict).stream.dict.lookup(PDFName.of("Resources"), PDFDict).lookup(PDFName.of("Font"), PDFDict);
      expect(fonts.lookup(PDFName.of("Helv"), PDFDict).lookup(PDFName.of("BaseFont"), PDFName).decodeText()).toBe("Helvetica");
      expect(appearance(dict).text).toContain("/Helv 10 Tf");
    });
    const [length, path, area] = dicts;
    expect(nums(length, "L")).toEqual([100, 100, 400, 100]);
    expect(nums(path, "Vertices")).toEqual([100, 200, 400, 200, 400, 500]);
    expect(nums(area, "IC")).toEqual(style.color);
  });

  it("reopens in pdf.js with every caption drawn", async () => {
    const pdf = await openPdf(await writeAnnotations(await blank(), [], allMeasurements()));
    const page = await pdf.getPage(1);
    const annotations = await page.getAnnotations();
    expect(annotations.map((annotation) => annotation.it)).toEqual(["LineDimension", "PolyLineDimension", "PolygonDimension"]);
    expect(annotations.every((annotation) => annotation.hasAppearance)).toBe(true);
    expect(annotations.every(isClaimedShape)).toBe(true);
    const { fnArray } = await page.getOperatorList({ annotationMode: 2 });
    expect(fnArray.filter((fn) => fn === OPS.showText)).toHaveLength(3);
  });

  it("writes square metres in WinAnsi", async () => {
    const metric = measure("measure-area", [0, 0, 72, 0, 72, 72, 0, 72], { measure: { scale: scalePresets.find((scale) => scale.label === "1:100")!, format: { unit: "m", precision: 2 } } });
    const [dict] = await pageAnnots(await writeAnnotations(await blank(), [], [metric]));
    expect(textOf(dict, "Contents")).toBe("6.45 m²");
    expect(appearance(dict).text).toMatch(/B2> Tj/i);
  });

  it("reads back what it wrote", async () => {
    const markup = allMeasurements();
    const read = readMarkup(await PDFDocument.load(await writeAnnotations(await blank(), [], markup)));
    expect(read.map((entry) => entry.kind)).toEqual(["measure-length", "measure-path", "measure-area"]);
    expect(read[0]).toMatchObject({ line: [100, 100, 400, 100], vertices: null, endings: ["OpenArrow", "OpenArrow"] });
    expect(read[1].vertices).toEqual([100, 200, 400, 200, 400, 500]);
    expect(read[2]).toMatchObject({ vertices: [100, 550, 400, 550, 400, 700, 100, 700], box: [100, 550, 400, 700], fill: style.color });
    for (const entry of read) {
      expect(sameScale(entry.measure!.scale, eighth)).toBe(true);
      expect(entry.measure!.format).toEqual(settings.format);
      expect(captionText(entry)).toBe(captionText(markup[read.indexOf(entry)]));
    }
  });

  it("keeps captions upright on a rotated page", async () => {
    const saved = await writeAnnotations(await blank(90), [], [measure("measure-area", [100, 100, 200, 100, 200, 200, 100, 200], { rotation: 90 })]);
    const [read] = readMarkup(await PDFDocument.load(saved));
    expect(read.rotation).toBe(90);
    expect(captionPlacement(read).angle).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe("measurements from other apps", () => {
  async function foreign(pageScale: boolean) {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const { context } = doc;
    const page = doc.getPage(0).node;
    if (pageScale) {
      setPageScale(context, page, eighth, settings.format);
    }
    const bare = context.register(
      context.obj({ Type: "Annot", Subtype: "Polygon", IT: "PolygonDimension", Rect: [90, 90, 210, 210], Vertices: [100, 100, 200, 100, 200, 200, 100, 200], C: [1, 0, 0], T: PDFHexString.fromText("Estimator"), Contents: PDFHexString.fromText("old") }),
    );
    const own = context.register(context.obj({ Type: "Annot", Subtype: "PolyLine", IT: "PolyLineDimension", Rect: [0, 290, 310, 310], Vertices: [0, 300, 300, 300], C: [0, 0, 1], Measure: measureDict(context, fullSize, { unit: "in", precision: 8 }) }));
    const leadered = context.register(context.obj({ Type: "Annot", Subtype: "Line", IT: "LineDimension", Rect: [0, 400, 200, 440], L: [10, 410, 190, 410], LL: 20, C: [0, 0, 0] }));
    const cloud = context.register(context.obj({ Type: "Annot", Subtype: "Polygon", IT: "PolygonCloud", Rect: [300, 300, 400, 400], Vertices: [300, 300, 400, 300, 400, 400] }));
    page.set(PDFName.of("Annots"), context.obj([bare, own, leadered, cloud]));
    return { bytes: await doc.save({ useObjectStreams: false }), bare, own };
  }

  it("takes the page's scale when a measurement has none of its own and skips leadered dimensions and clouds", async () => {
    const { bytes, bare, own } = await foreign(true);
    const read = readMarkup(await PDFDocument.load(bytes));
    expect(read.map((entry) => entry.id)).toEqual([idOfRef(bare), idOfRef(own)]);
    expect(sameScale(read[0].measure!.scale, eighth)).toBe(true);
    expect(captionText(read[0])).toBe("123.46 sq ft");
    expect(sameScale(read[1].measure!.scale, fullSize)).toBe(true);
    expect(read[1].measure!.format).toEqual({ unit: "in", precision: 8 });
    expect(captionText(read[1])).toBe(`4 1/8"`);
  });

  it("has no scale without a page viewport", async () => {
    const [bare] = readMarkup(await PDFDocument.load((await foreign(false)).bytes));
    expect(bare.measure).toBeNull();
  });

  it("rewrites a moved measurement's caption and keeps its own keys", async () => {
    const { bytes, bare } = await foreign(true);
    const [found] = readMarkup(await PDFDocument.load(bytes));
    const moved = reshapedMarkup(found, { vertices: [100, 100, 300, 100, 300, 200, 100, 200] }, date);
    const saved = await writeAnnotations(bytes, [], [moved]);
    const doc = await PDFDocument.load(saved);
    const dict = doc.context.lookup(bare as PDFRef, PDFDict);
    expect(textOf(dict, "Contents")).toBe("246.91 sq ft");
    expect(textOf(dict, "T")).toBe("Estimator");
    expect(nums(dict, "Vertices")).toEqual([100, 100, 300, 100, 300, 200, 100, 200]);
    expect(dict.has(PDFName.of("Measure"))).toBe(true);
    expect(appearance(dict).text).toContain("Tj");
  });

  it("leaves a restyled measurement's popup where it was", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const { context } = doc;
    const page = doc.getPage(0).node;
    setPageScale(context, page, eighth, settings.format);
    const popup = context.register(context.obj({ Type: "Annot", Subtype: "Popup", Rect: [300, 600, 480, 700] }));
    const line = context.register(context.obj({ Type: "Annot", Subtype: "Line", IT: "LineDimension", Rect: [95, 295, 135, 315], L: [100, 300, 130, 300], C: [1, 0, 0], Popup: popup }));
    page.set(PDFName.of("Annots"), context.obj([line, popup]));
    const bytes = await doc.save({ useObjectStreams: false });
    const [found] = readMarkup(await PDFDocument.load(bytes));
    const saved = await PDFDocument.load(await writeAnnotations(bytes, [], [{ ...found, color: [0, 0.5, 0], date }]));
    expect(nums(saved.context.lookup(popup, PDFDict), "Rect")).toEqual([300, 600, 480, 700]);
  });
});
