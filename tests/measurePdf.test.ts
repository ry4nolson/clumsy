import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } from "@cantoo/pdf-lib";
import { decimalPrecisions, fractionPrecisions, fullSize, isFractional, lengthUnits, measureCaption, sameScale, scalePresets, type MeasureFormat, type MeasureKind } from "../src/lib/measure";
import {
  VIEWPORT_NAME,
  formatFromMeasure,
  measureDict,
  measureFormats,
  measureKindOf,
  measurementFromDict,
  pageBoxOf,
  scaleFromMeasure,
  setMeasureKeys,
  setPageScale,
  viewportAt,
  viewportsOf,
} from "../src/lib/measurePdf";
import { openPdf } from "./pdfjsNode";

const eighth = scalePresets.find((scale) => scale.label === `1/8" = 1'-0"`)!;
const metric = scalePresets.find((scale) => scale.label === "1:100")!;
const ftIn: MeasureFormat = { unit: "ft-in", precision: 16 };
const name = (value: string) => PDFName.of(value);

async function reload(doc: PDFDocument) {
  return PDFDocument.load(await doc.save({ useObjectStreams: false }));
}

async function measureRoundTrip(scale = eighth, format = ftIn) {
  const doc = await PDFDocument.create();
  doc.catalog.set(name("TestMeasure"), doc.context.register(measureDict(doc.context, scale, format)));
  const loaded = await reload(doc);
  return loaded.catalog.lookup(name("TestMeasure"), PDFDict);
}

function foreignMeasure(doc: PDFDocument, entries: Record<string, unknown>) {
  return doc.context.obj(entries as never) as PDFDict;
}

const pageDict = (doc: PDFDocument, index = 0) => doc.context.lookup(doc.getPage(index).ref, PDFDict);

describe("number formats", () => {
  it("converts points to feet in X and chains feet and inches in D", () => {
    const formats = measureFormats(eighth, ftIn);
    expect(formats.ratio).toBe(`1/8" = 1'-0"`);
    expect(formats.x).toHaveLength(1);
    expect(formats.x[0].unit).toBe("ft");
    expect(formats.x[0].factor).toBeCloseTo(1 / 9, 9);
    expect(formats.d).toEqual([
      { unit: "ft", factor: 1, display: "T", denominator: 1 },
      { unit: "in", factor: 12, display: "F", denominator: 16 },
    ]);
    expect(formats.a).toEqual([{ unit: "sq ft", factor: 1, display: "D", denominator: 100 }]);
  });

  it("uses the display unit directly for metric and decimal formats", () => {
    const formats = measureFormats(metric, { unit: "mm", precision: 1 });
    expect(formats.x[0].unit).toBe("mm");
    expect(formats.x[0].factor).toBeCloseTo((100 / 72) * 25.4, 6);
    expect(formats.d).toEqual([{ unit: "mm", factor: 1, display: "D", denominator: 10 }]);
    expect(formats.a).toEqual([{ unit: "sq mm", factor: 1, display: "D", denominator: 10 }]);
    expect(measureFormats(eighth, { unit: "in", precision: 8 }).d).toEqual([{ unit: "in", factor: 1, display: "F", denominator: 8 }]);
  });

  it("formats a length the way a reader would from X and D", () => {
    const formats = measureFormats(eighth, ftIn);
    const points = (25 * 12 + 6.5) / eighth.inchesPerPoint;
    const feet = points * formats.x[0].factor;
    const whole = Math.trunc(feet * formats.d[0].factor);
    const inches = (feet - whole) * formats.d[1].factor;
    expect(whole).toBe(25);
    expect(Math.round(inches * 16) / 16).toBe(6.5);
  });
});

describe("measure dictionaries", () => {
  it.each(lengthUnits.flatMap((unit) => (isFractional(unit) ? fractionPrecisions : decimalPrecisions).map((precision) => ({ unit, precision }))))(
    "reads back $unit at $precision",
    async (format) => {
      const measure = await measureRoundTrip(eighth, format);
      expect(sameScale(scaleFromMeasure(measure)!, eighth)).toBe(true);
      expect(scaleFromMeasure(measure)!.label).toBe(eighth.label);
      expect(formatFromMeasure(measure)).toEqual(format);
    },
  );

  it("writes the spec's keys", async () => {
    const measure = await measureRoundTrip(fullSize, ftIn);
    expect(measure.lookup(name("Type"), PDFName).decodeText()).toBe("Measure");
    expect(measure.lookup(name("Subtype"), PDFName).decodeText()).toBe("RL");
    expect(measure.lookup(name("R"), PDFString, PDFHexString).decodeText()).toBe("Full size (1:1)");
    const feet = measure.lookup(name("D"), PDFArray).lookup(0, PDFDict);
    expect(feet.lookup(name("Type"), PDFName).decodeText()).toBe("NumberFormat");
    expect(feet.lookup(name("F"), PDFName).decodeText()).toBe("T");
    expect(feet.has(name("D"))).toBe(false);
    expect(sameScale(scaleFromMeasure(measure)!, fullSize)).toBe(true);
  });

  it("reads other apps' measure dictionaries without /Type", async () => {
    const doc = await PDFDocument.create();
    const measure = foreignMeasure(doc, { Subtype: "RL", R: PDFString.of("1:100"), X: [doc.context.obj({ U: PDFString.of("mm"), C: 35.2778 })] });
    expect(scaleFromMeasure(measure)!.inchesPerPoint).toBeCloseTo(35.2778 / 25.4, 9);
    expect(formatFromMeasure(measure)).toEqual({ unit: "mm", precision: 2 });
  });

  it("reads foreign chains at the nearest supported precision", async () => {
    const doc = await PDFDocument.create();
    const fmt = (entries: Record<string, unknown>) => doc.context.obj({ C: 1, ...entries } as never);
    const chain = (...formats: PDFDict[]) => foreignMeasure(doc, { R: PDFString.of("x"), X: [fmt({ U: PDFString.of("ft") })], D: formats });
    expect(formatFromMeasure(chain(fmt({ U: PDFString.of("ft"), F: "T" }), fmt({ U: PDFString.of("in"), F: "F", D: 32 })))).toEqual({ unit: "ft-in", precision: 16 });
    expect(formatFromMeasure(chain(fmt({ U: PDFString.of("feet"), D: 1000 })))).toEqual({ unit: "ft", precision: 2 });
    expect(formatFromMeasure(chain(fmt({ U: PDFString.of("in"), F: "F", D: 2 })))).toEqual({ unit: "in", precision: 4 });
    expect(formatFromMeasure(chain(fmt({ U: PDFString.of("m"), F: "R" })))).toEqual({ unit: "m", precision: 0 });
    expect(formatFromMeasure(chain(fmt({ U: PDFString.of("yd") })))).toBeNull();
  });

  it("treats blank and unknown units as no scale", async () => {
    const doc = await PDFDocument.create();
    const { context } = doc;
    const cad = foreignMeasure(doc, { R: PDFString.of(" "), X: [context.obj({ U: PDFString.of(" "), C: 0.35278 })] });
    const blankUnit = foreignMeasure(doc, { R: PDFString.of("1:100"), X: [context.obj({ U: PDFString.of(" "), C: 0.35278 })] });
    const blankRatio = foreignMeasure(doc, { R: PDFString.of(""), X: [context.obj({ U: PDFString.of("mm"), C: 0.35278 })] });
    const geo = foreignMeasure(doc, { Subtype: "GEO", R: PDFString.of("1:100"), X: [context.obj({ U: PDFString.of("mm"), C: 1 })] });
    const odd = foreignMeasure(doc, { R: PDFString.of("1:100"), X: [context.obj({ U: PDFString.of("furlong"), C: 1 })] });
    const zero = foreignMeasure(doc, { R: PDFString.of("1:100"), X: [context.obj({ U: PDFString.of("mm"), C: 0 })] });
    for (const measure of [cad, blankUnit, blankRatio, geo, odd, zero, undefined]) {
      expect(scaleFromMeasure(measure)).toBeNull();
    }
  });
});

describe("page viewports", () => {
  it("writes one viewport over the crop box and reads it back", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([1224, 792]).node.set(name("CropBox"), doc.context.obj([18, 18, 1206, 774]));
    setPageScale(doc.context, pageDict(doc), eighth, ftIn);
    const loaded = await reload(doc);
    const [viewport] = viewportsOf(pageDict(loaded));
    expect(viewport.box).toEqual([18, 18, 1206, 774]);
    expect(viewport.name).toBe(VIEWPORT_NAME);
    expect(sameScale(viewport.scale!, eighth)).toBe(true);
    expect(viewport.format).toEqual(ftIn);
  });

  it("finds an inherited media box", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    page.node.delete(name("MediaBox"));
    doc.catalog.lookup(name("Pages"), PDFDict).set(name("MediaBox"), doc.context.obj([0, 0, 500, 200]));
    expect(pageBoxOf(page.node)).toEqual([0, 0, 500, 200]);
  });

  it("keeps other apps' viewports and replaces its own", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([1224, 792]);
    const { context } = doc;
    const page = pageDict(doc);
    const cad = context.register(
      context.obj({ BBox: [36, 36, 1187, 755], Name: PDFString.of("Layout"), Measure: { R: PDFString.of(" "), X: [{ U: PDFString.of(" "), C: 0.35278 }] } } as never),
    );
    page.set(name("VP"), context.obj([cad]));
    expect(viewportsOf(page)[0].scale).toBeNull();
    setPageScale(context, page, eighth, ftIn);
    setPageScale(context, page, metric, { unit: "m", precision: 2 });
    const viewports = viewportsOf(page);
    expect(viewports.map((viewport) => viewport.name)).toEqual(["Layout", VIEWPORT_NAME]);
    expect(page.lookup(name("VP"), PDFArray).get(0)).toBeInstanceOf(PDFRef);
    expect(sameScale(viewportAt(viewports, 600, 400)!.scale!, metric)).toBe(true);
    setPageScale(context, page, null, ftIn);
    expect(viewportsOf(page).map((viewport) => viewport.name)).toEqual(["Layout"]);
  });

  it("removes /VP when its own viewport was the only one", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    setPageScale(doc.context, pageDict(doc), eighth, ftIn);
    setPageScale(doc.context, pageDict(doc), null, ftIn);
    expect(pageDict(doc).has(name("VP"))).toBe(false);
  });

  it("picks the last viewport containing a point, and none outside them all", () => {
    const viewports = [
      { box: [0, 0, 600, 400], name: "a", scale: eighth, format: ftIn },
      { box: [100, 100, 300, 300], name: "b", scale: null, format: null },
    ];
    expect(viewportAt(viewports, 200, 200)!.name).toBe("b");
    expect(viewportAt(viewports, 500, 50)!.name).toBe("a");
    expect(viewportAt(viewports, 700, 50)).toBeNull();
  });
});

const geometry: Record<MeasureKind, number[]> = {
  "measure-length": [100, 100, 400, 100],
  "measure-path": [100, 200, 400, 200, 400, 500],
  "measure-area": [100, 100, 400, 100, 400, 400, 100, 400],
};

const subtypes: Record<MeasureKind, string> = { "measure-length": "Line", "measure-path": "PolyLine", "measure-area": "Polygon" };

async function withMeasurement(kind: MeasureKind, extra: Record<string, unknown> = {}) {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const { context } = doc;
  const points = geometry[kind];
  const dict = context.obj({ Type: "Annot", Subtype: subtypes[kind], Rect: [90, 90, 410, 510], F: 4, ...extra } as never) as PDFDict;
  setMeasureKeys(context, dict, { kind, points, scale: eighth, format: ftIn, caption: measureCaption(kind, points, eighth, ftIn) });
  pageDict(doc).set(name("Annots"), context.obj([context.register(dict)]));
  return reload(doc);
}

const firstAnnot = (doc: PDFDocument) => pageDict(doc).lookup(name("Annots"), PDFArray).lookup(0, PDFDict);

describe("measurement annotations", () => {
  it.each(Object.keys(geometry) as MeasureKind[])("writes and reads %s", async (kind) => {
    const doc = await withMeasurement(kind);
    const measurement = measurementFromDict(firstAnnot(doc))!;
    expect(measurement.kind).toBe(kind);
    expect(measurement.points).toEqual(geometry[kind]);
    expect(measurement.leadered).toBe(false);
    expect(sameScale(measurement.scale!, eighth)).toBe(true);
    expect(measurement.format).toEqual(ftIn);
    expect(measurement.caption).toBe(measureCaption(kind, geometry[kind], eighth, ftIn));
  });

  it("captions at the scale", async () => {
    expect(measurementFromDict(firstAnnot(await withMeasurement("measure-length")))!.caption).toBe(`33' 4"`);
    expect(measurementFromDict(firstAnnot(await withMeasurement("measure-path")))!.caption).toBe(`66' 8"`);
    expect(measurementFromDict(firstAnnot(await withMeasurement("measure-area")))!.caption).toBe("1,111.11 sq ft");
  });

  it("marks a length with a caption on top", async () => {
    const dict = firstAnnot(await withMeasurement("measure-length"));
    expect(dict.lookup(name("Cap"))?.toString()).toBe("true");
    expect(dict.lookup(name("CP"), PDFName).decodeText()).toBe("Top");
    expect(dict.has(name("Vertices"))).toBe(false);
  });

  it("flags leadered dimension lines", async () => {
    expect(measurementFromDict(firstAnnot(await withMeasurement("measure-length", { LL: 12 })))!.leadered).toBe(true);
    expect(measurementFromDict(firstAnnot(await withMeasurement("measure-length", { LLO: 4 })))!.leadered).toBe(true);
    expect(measurementFromDict(firstAnnot(await withMeasurement("measure-length", { LL: 0 })))!.leadered).toBe(false);
  });

  it("ignores annotations that aren't measurements", async () => {
    const doc = await PDFDocument.create();
    const { context } = doc;
    const make = (entries: Record<string, unknown>) => context.obj({ Type: "Annot", ...entries } as never) as PDFDict;
    expect(measureKindOf(make({ Subtype: "Polygon", IT: "PolygonCloud", Vertices: geometry["measure-area"] }))).toBeNull();
    expect(measurementFromDict(make({ Subtype: "Line", L: [0, 0, 10, 10] }))).toBeNull();
    expect(measurementFromDict(make({ Subtype: "Polygon", IT: "PolygonDimension", Vertices: [0, 0, 10, 0] }))).toBeNull();
    expect(measurementFromDict(make({ Subtype: "PolyLine", IT: "PolyLineDimension", Vertices: [0, 0, 10] }))).toBeNull();
    expect(measurementFromDict(make({ Subtype: "Line", IT: "LineDimension", L: [0, 0, 10, 0, 20, 0] }))).toBeNull();
  });

  it("reads a measurement with no scale of its own", async () => {
    const doc = await PDFDocument.create();
    const dict = doc.context.obj({ Subtype: "PolyLine", IT: "PolyLineDimension", Vertices: [0, 0, 10, 0], Contents: PDFString.of("10'") } as never) as PDFDict;
    expect(measurementFromDict(dict)).toMatchObject({ kind: "measure-path", scale: null, format: null, caption: "10'" });
  });

  it("opens in pdf.js with the measure intent and vertices", async () => {
    for (const kind of Object.keys(geometry) as MeasureKind[]) {
      const doc = await withMeasurement(kind);
      const pdf = await openPdf(await doc.save());
      const [annotation] = await (await pdf.getPage(1)).getAnnotations();
      expect(annotation.subtype).toBe(subtypes[kind]);
      expect(annotation.it).toBe(kind === "measure-length" ? "LineDimension" : kind === "measure-path" ? "PolyLineDimension" : "PolygonDimension");
      if (kind === "measure-length") {
        expect([...annotation.lineCoordinates]).toEqual(geometry[kind]);
      } else {
        expect(Array.from(annotation.vertices as Float32Array)).toEqual(geometry[kind]);
      }
      expect(annotation.contentsObj.str).toBe(measureCaption(kind, geometry[kind], eighth, ftIn));
    }
  });
});

describe("scale factors", () => {
  it("keeps the factor's precision", async () => {
    const measure = await measureRoundTrip(eighth, ftIn);
    const factor = measure.lookup(name("X"), PDFArray).lookup(0, PDFDict).lookup(name("C"), PDFNumber).asNumber();
    expect(Math.abs(factor - 1 / 9)).toBeLessThan(1e-9);
  });
});
