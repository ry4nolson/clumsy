import { PDFArray, PDFBool, PDFDict, PDFHexString, PDFName, PDFNumber, PDFString, type PDFContext, type PDFObject } from "@cantoo/pdf-lib";
import { areaPlaces, decimalPrecisions, defaultFormat, fractionPrecisions, isFractional, type LengthUnit, type MeasureFormat, type MeasureKind, type MeasureScale } from "./measure";

export type FormatDisplay = "D" | "F" | "R" | "T";
export type NumberFormat = { unit: string; factor: number; display: FormatDisplay; denominator: number };
export type MeasureFormats = { ratio: string; x: NumberFormat[]; d: NumberFormat[]; a: NumberFormat[] };
export type Viewport = { box: number[]; name: string | null; scale: MeasureScale | null; format: MeasureFormat | null };
export type Measurement = { kind: MeasureKind; points: number[]; leadered: boolean; scale: MeasureScale | null; format: MeasureFormat | null; caption: string | null };
export type PageScale = { scale: MeasureScale; format: MeasureFormat };
export type MeasureKeys = { kind: MeasureKind; points: number[]; scale: MeasureScale; format: MeasureFormat; caption: string };

export const VIEWPORT_NAME = "Clumsy";

export const measureIntents: Record<MeasureKind, { subtype: string; intent: string; subject: string }> = {
  "measure-length": { subtype: "Line", intent: "LineDimension", subject: "Length" },
  "measure-path": { subtype: "PolyLine", intent: "PolyLineDimension", subject: "Path" },
  "measure-area": { subtype: "Polygon", intent: "PolygonDimension", subject: "Area" },
};

const name = (value: string) => PDFName.of(value);

const inchesPer: Record<string, number> = {
  ft: 12,
  foot: 12,
  feet: 12,
  "'": 12,
  in: 1,
  inch: 1,
  inches: 1,
  '"': 1,
  yd: 36,
  mi: 63360,
  mm: 1 / 25.4,
  cm: 10 / 25.4,
  m: 1000 / 25.4,
  km: 1e6 / 25.4,
};

const metricUnits = new Set(["mm", "cm", "m", "km"]);

const lengthUnitOf = (unit: string): Exclude<LengthUnit, "ft-in"> | null => {
  const key = unit.trim().toLowerCase();
  const inches = inchesPer[key];
  if (inches === undefined) {
    return null;
  }
  return metricUnits.has(key) ? (inches < inchesPer.m ? "mm" : "m") : inches < 12 ? "in" : "ft";
};

const baseUnit = (unit: LengthUnit) => (unit === "ft-in" ? "ft" : unit);

const significant = (value: number) => Number(value.toPrecision(10));
const round = (value: number) => Math.round(value * 1000) / 1000;

export function measureFormats(scale: MeasureScale, format: MeasureFormat): MeasureFormats {
  const { unit, precision } = format;
  const base = baseUnit(unit);
  const decimals = (places: number) => ({ display: "D" as const, denominator: 10 ** places });
  const d: NumberFormat[] =
    unit === "ft-in"
      ? [
          { unit: "ft", factor: 1, display: "T", denominator: 1 },
          { unit: "in", factor: 12, display: "F", denominator: precision },
        ]
      : isFractional(unit)
        ? [{ unit: base, factor: 1, display: "F", denominator: precision }]
        : [{ unit: base, factor: 1, ...decimals(precision) }];
  return {
    ratio: scale.label,
    x: [{ unit: base, factor: significant(scale.inchesPerPoint / inchesPer[base]), ...decimals(2) }],
    d,
    a: [{ unit: `sq ${base}`, factor: 1, ...decimals(areaPlaces(format)) }],
  };
}

const textString = (value: string) => (/^[\x20-\x7e]*$/.test(value) && !/[()\\]/.test(value) ? PDFString.of(value) : PDFHexString.fromText(value));

function formatDict(context: PDFContext, format: NumberFormat) {
  const dict = context.obj({ Type: "NumberFormat", C: format.factor, F: format.display });
  dict.set(name("U"), textString(format.unit));
  if (format.display !== "T") {
    dict.set(name("D"), PDFNumber.of(format.denominator));
  }
  return dict;
}

export function measureDict(context: PDFContext, scale: MeasureScale, format: MeasureFormat) {
  const formats = measureFormats(scale, format);
  const list = (items: NumberFormat[]) => context.obj(items.map((item) => formatDict(context, item)));
  const dict = context.obj({ Type: "Measure", Subtype: "RL", X: list(formats.x), D: list(formats.d), A: list(formats.a) });
  dict.set(name("R"), textString(formats.ratio));
  return dict;
}

const textOf = (value: PDFObject | undefined) => (value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : null);

function numbersOf(array: PDFArray | undefined) {
  const values = array?.asArray().map((_, index) => array.lookupMaybe(index, PDFNumber)?.asNumber());
  return values && !values.some((value) => value === undefined) ? (values as number[]) : null;
}

const displays = new Set<string>(["D", "F", "R", "T"]);

function formatsOf(measure: PDFDict, key: string): NumberFormat[] | null {
  const array = measure.lookupMaybe(name(key), PDFArray);
  if (!array?.size()) {
    return null;
  }
  const formats: NumberFormat[] = [];
  for (let index = 0; index < array.size(); index++) {
    const dict = array.lookupMaybe(index, PDFDict);
    const factor = dict?.lookupMaybe(name("C"), PDFNumber)?.asNumber();
    if (!dict || factor === undefined) {
      return null;
    }
    const shown = dict.lookupMaybe(name("F"), PDFName)?.decodeText() ?? "D";
    const display = (displays.has(shown) ? shown : "D") as FormatDisplay;
    const denominator = dict.lookupMaybe(name("D"), PDFNumber)?.asNumber() ?? (display === "F" ? 16 : 100);
    formats.push({ unit: textOf(dict.lookup(name("U"))) ?? "", factor, display, denominator });
  }
  return formats;
}

export function scaleFromMeasure(measure: PDFDict | undefined): MeasureScale | null {
  const subtype = measure?.lookupMaybe(name("Subtype"), PDFName)?.decodeText();
  if (!measure || (subtype && subtype !== "RL")) {
    return null;
  }
  const label = textOf(measure.lookup(name("R")))?.trim();
  const first = formatsOf(measure, "X")?.[0];
  const perUnit = first && inchesPer[first.unit.trim().toLowerCase()];
  if (!label || !first || !perUnit || !(first.factor > 0) || !Number.isFinite(first.factor)) {
    return null;
  }
  return { label, inchesPerPoint: first.factor * perUnit };
}

const nearest = (value: number, choices: number[]) => choices.reduce((best, choice) => (Math.abs(choice - value) < Math.abs(best - value) ? choice : best));

const fractionOf = (format: NumberFormat) => (format.display === "F" ? nearest(format.denominator, fractionPrecisions) : fractionPrecisions[0]);

const decimalsOf = (format: NumberFormat) =>
  format.display === "D" && format.denominator > 0 ? nearest(Math.log10(format.denominator), decimalPrecisions) : format.display === "F" ? decimalPrecisions.at(-1)! : 0;

export function formatFromMeasure(measure: PDFDict | undefined): MeasureFormat | null {
  const chain = measure && (formatsOf(measure, "D") ?? formatsOf(measure, "X"));
  const first = chain?.[0];
  const unit = first && lengthUnitOf(first.unit);
  if (!chain || !first || !unit) {
    return null;
  }
  const second = chain[1];
  if (unit === "ft" && second && lengthUnitOf(second.unit) === "in") {
    return { unit: "ft-in", precision: fractionOf(second) };
  }
  return { unit, precision: isFractional(unit) ? fractionOf(first) : decimalsOf(first) };
}

const normalized = ([x1, y1, x2, y2]: number[]) => [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];

export function viewportsOf(page: PDFDict): Viewport[] {
  const array = page.lookupMaybe(name("VP"), PDFArray);
  const viewports: Viewport[] = [];
  for (let index = 0; index < (array?.size() ?? 0); index++) {
    const dict = array!.lookupMaybe(index, PDFDict);
    const box = numbersOf(dict?.lookupMaybe(name("BBox"), PDFArray));
    if (!dict || box?.length !== 4) {
      continue;
    }
    const measure = dict.lookupMaybe(name("Measure"), PDFDict);
    const scale = scaleFromMeasure(measure);
    viewports.push({ box: normalized(box), name: textOf(dict.lookup(name("Name"))), scale, format: scale && formatFromMeasure(measure) });
  }
  return viewports;
}

export function viewportAt(viewports: Viewport[], x: number, y: number) {
  for (let index = viewports.length - 1; index >= 0; index--) {
    const [x1, y1, x2, y2] = viewports[index].box;
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
      return viewports[index];
    }
  }
  return null;
}

export function pageBoxOf(page: PDFDict) {
  for (const key of ["CropBox", "MediaBox"]) {
    const seen = new Set<PDFDict>();
    for (let node: PDFDict | undefined = page; node && !seen.has(node); node = node.lookupMaybe(name("Parent"), PDFDict)) {
      seen.add(node);
      const box = numbersOf(node.lookupMaybe(name(key), PDFArray));
      if (box?.length === 4) {
        return normalized(box);
      }
    }
  }
  return [0, 0, 612, 792];
}

export function pageScaleOf(page: PDFDict): PageScale | null {
  const scaled = viewportsOf(page).filter((viewport) => viewport.scale);
  const [x1, y1, x2, y2] = pageBoxOf(page);
  const chosen = scaled.find((viewport) => viewport.name === VIEWPORT_NAME) ?? viewportAt(scaled, (x1 + x2) / 2, (y1 + y2) / 2);
  return chosen?.scale ? { scale: chosen.scale, format: chosen.format ?? defaultFormat } : null;
}

const isOwnViewport = (context: PDFContext, entry: PDFObject) => {
  const dict = context.lookupMaybe(entry, PDFDict);
  return !!dict && textOf(dict.lookup(name("Name"))) === VIEWPORT_NAME;
};

export function setPageScale(context: PDFContext, page: PDFDict, scale: MeasureScale | null, format: MeasureFormat) {
  const kept = (page.lookupMaybe(name("VP"), PDFArray)?.asArray() ?? []).filter((entry) => !isOwnViewport(context, entry));
  if (scale) {
    const viewport = context.obj({ Type: "Viewport", BBox: pageBoxOf(page), Measure: measureDict(context, scale, format) });
    viewport.set(name("Name"), PDFString.of(VIEWPORT_NAME));
    kept.push(viewport);
  }
  if (kept.length) {
    page.set(name("VP"), context.obj(kept));
  } else {
    page.delete(name("VP"));
  }
}

export function measureKindOf(dict: PDFDict): MeasureKind | null {
  const subtype = dict.lookupMaybe(name("Subtype"), PDFName)?.decodeText();
  const intent = dict.lookupMaybe(name("IT"), PDFName)?.decodeText();
  const found = Object.entries(measureIntents).find(([, entry]) => entry.subtype === subtype && entry.intent === intent);
  return found ? (found[0] as MeasureKind) : null;
}

const hasLeader = (dict: PDFDict) => !!dict.lookupMaybe(name("LL"), PDFNumber)?.asNumber() || !!dict.lookupMaybe(name("LLO"), PDFNumber)?.asNumber();

export function measurementFromDict(dict: PDFDict): Measurement | null {
  const kind = measureKindOf(dict);
  if (!kind) {
    return null;
  }
  const isLength = kind === "measure-length";
  const points = numbersOf(dict.lookupMaybe(name(isLength ? "L" : "Vertices"), PDFArray));
  const fewest = kind === "measure-area" ? 6 : 4;
  if (!points || points.length % 2 || points.length < fewest || (isLength && points.length !== 4)) {
    return null;
  }
  const measure = dict.lookupMaybe(name("Measure"), PDFDict);
  const scale = scaleFromMeasure(measure);
  return { kind, points, leadered: isLength && hasLeader(dict), scale, format: scale && formatFromMeasure(measure), caption: textOf(dict.lookup(name("Contents"))) };
}

export function setMeasureKeys(context: PDFContext, dict: PDFDict, { kind, points, scale, format, caption }: MeasureKeys) {
  dict.set(name("IT"), name(measureIntents[kind].intent));
  dict.set(name("Measure"), measureDict(context, scale, format));
  dict.set(name("Contents"), PDFHexString.fromText(caption));
  const coordinates = context.obj(points.map(round));
  if (kind === "measure-length") {
    dict.set(name("L"), coordinates);
    dict.set(name("Cap"), PDFBool.True);
    dict.set(name("CP"), name("Top"));
  } else {
    dict.set(name("Vertices"), coordinates);
  }
}
