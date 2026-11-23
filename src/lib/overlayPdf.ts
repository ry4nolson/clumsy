import { PDFArray, PDFContentStream, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFObjectCopier, PDFRawStream, PDFRef, decodePDFRawStream, type PDFObject } from "@cantoo/pdf-lib";
import { centered, pageView, placedOn, type PageBox, type PageView } from "./alignment";
import type { CompressProgress } from "./compressPlan";
import { IDENTITY, multiply, type Matrix } from "./contentPlacements";
import { newMarkup, type Markup, type MarkupStyle } from "./markup";
import { applyMarkup } from "./markupPdf";
import { pdfDate } from "./notes";
import { CHANGE_SUBJECT, CURRENT_LAYER, PREVIOUS_LAYER, layerName, type OverlayOptions, type Rgb } from "./overlayPlan";
import { PageEditError } from "./pageEditPlan";
import { writePageLabels } from "./pdfPageLabels";
import { flattenPageTree, setPageRefs } from "./pdfStructure";

const key = PDFName.of;
const CHANGE_STYLE: MarkupStyle = { color: [0.93, 0.55, 0], fill: false, width: 1.5, opacity: 1 };
const LETTER: PageBox = { left: 0, bottom: 0, right: 612, top: 792 };

type Side = { doc: PDFDocument; refs: PDFRef[]; copier: PDFObjectCopier; forms: Map<number, EmbeddedPage | null> };

type EmbeddedPage = { form: PDFRef; view: PageView; unit: number };

const number = (value: number) => (Math.abs(value) < 1e-9 ? "0" : String(Number(value.toFixed(6))));

const numbers = (values: number[]) => values.map(number).join(" ");

function boxOf(page: PDFDict, name: string): PageBox | null {
  const box = page.lookup(key(name));
  if (!(box instanceof PDFArray) || box.size() !== 4) {
    return null;
  }
  const values = [0, 1, 2, 3].map((index) => box.lookup(index));
  if (!values.every((value): value is PDFNumber => value instanceof PDFNumber && Number.isFinite(value.asNumber()))) {
    return null;
  }
  const [x0, y0, x1, y1] = values.map((value) => value.asNumber());
  const found = { left: Math.min(x0, x1), bottom: Math.min(y0, y1), right: Math.max(x0, x1), top: Math.max(y0, y1) };
  return found.right - found.left >= 1 && found.top - found.bottom >= 1 ? found : null;
}

export function visibleBox(page: PDFDict): PageBox {
  const media = boxOf(page, "MediaBox") ?? LETTER;
  const crop = boxOf(page, "CropBox");
  if (!crop) {
    return media;
  }
  const clipped = { left: Math.max(media.left, crop.left), bottom: Math.max(media.bottom, crop.bottom), right: Math.min(media.right, crop.right), top: Math.min(media.top, crop.top) };
  return clipped.right - clipped.left >= 1 && clipped.top - clipped.bottom >= 1 ? clipped : media;
}

function rotationOf(page: PDFDict) {
  const rotate = page.lookup(key("Rotate"));
  return rotate instanceof PDFNumber ? rotate.asNumber() : 0;
}

function userUnitOf(page: PDFDict) {
  const unit = page.lookup(key("UserUnit"));
  return unit instanceof PDFNumber && unit.asNumber() > 0 ? unit.asNumber() : 1;
}

const scaled = (factor: number): Matrix => [factor, 0, 0, factor, 0, 0];

const physical = (page: EmbeddedPage) => ({ width: page.view.width * page.unit, height: page.view.height * page.unit });

function refsIn(array: PDFObject | undefined) {
  return array instanceof PDFArray ? array.asArray().filter((entry): entry is PDFRef => entry instanceof PDFRef) : [];
}

function sourceLayers(side: Side) {
  const properties = side.doc.catalog.lookup(key("OCProperties"));
  if (!(properties instanceof PDFDict)) {
    return { all: [], hidden: [] };
  }
  const groups = refsIn(properties.lookup(key("OCGs")));
  const config = properties.lookup(key("D"));
  const settings = config instanceof PDFDict ? config : null;
  const on = new Set(refsIn(settings?.lookup(key("ON"))));
  const off = new Set(refsIn(settings?.lookup(key("OFF"))));
  const baseOff = settings?.lookup(key("BaseState")) === key("OFF");
  const copied = (ref: PDFRef) => side.copier.copy(ref) as PDFRef;
  return { all: groups.map(copied), hidden: groups.filter((ref) => (baseOff ? !on.has(ref) : off.has(ref))).map(copied) };
}

function decoded(stream: PDFObject | undefined) {
  try {
    if (stream instanceof PDFRawStream) {
      return decodePDFRawStream(stream).decode();
    }
    if (stream instanceof PDFContentStream) {
      return stream.getUnencodedContents();
    }
  } catch {
    return new Uint8Array();
  }
  return new Uint8Array();
}

function pageContent(page: PDFDict) {
  const contents = page.lookup(key("Contents"));
  const streams = contents instanceof PDFArray ? contents.asArray().map((_, index) => contents.lookup(index)) : [contents];
  const parts = streams.map(decoded);
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length + 1, 0)).fill(10);
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length + 1;
  }
  return joined;
}

function embedPage(target: PDFDocument, side: Side, index: number): EmbeddedPage | null {
  if (side.forms.has(index)) {
    return side.forms.get(index) ?? null;
  }
  const ref = side.refs[index];
  const page = ref && side.doc.context.lookup(ref);
  let embedded: EmbeddedPage | null = null;
  if (page instanceof PDFDict) {
    const box = visibleBox(page);
    const resources = page.get(key("Resources"));
    const form = side.doc.context.flateStream(pageContent(page), {
      Type: "XObject",
      Subtype: "Form",
      FormType: 1,
      BBox: [box.left, box.bottom, box.right, box.top],
      ...(resources ? { Resources: resources } : {}),
    });
    embedded = { form: target.context.register(side.copier.copy(form)), view: pageView(box, rotationOf(page)), unit: userUnitOf(page) };
  }
  side.forms.set(index, embedded);
  return embedded;
}

function tintedLayer(target: PDFDocument, page: EmbeddedPage, placement: Matrix, color: Rgb, width: number, height: number, states: { gray: PDFRef; tint: PDFRef }) {
  const area = `0 0 ${numbers([width, height])} re f`;
  const content = [
    `1 1 1 rg ${area}`,
    `q ${numbers(placement)} cm /Page Do Q`,
    `/Gray gs 1 1 1 rg ${area}`,
    `/Tint gs ${numbers(color)} rg ${area}`,
  ].join("\n");
  return target.context.register(
    target.context.flateStream(content, {
      Type: "XObject",
      Subtype: "Form",
      FormType: 1,
      BBox: [0, 0, width, height],
      Group: { Type: "Group", S: "Transparency", I: true, CS: "DeviceRGB" },
      Resources: { XObject: { Page: page.form }, ExtGState: { Gray: states.gray, Tint: states.tint } },
    }),
  );
}

const sideOf = (doc: PDFDocument, target: PDFDocument): Side => ({ doc, refs: flattenPageTree(doc), copier: PDFObjectCopier.for(doc.context, target.context), forms: new Map() });

export async function buildOverlay(previous: PDFDocument, current: PDFDocument, options: OverlayOptions, onProgress?: (progress: CompressProgress) => void) {
  const target = await PDFDocument.create({ updateMetadata: false });
  const sides = { previous: sideOf(previous, target), current: sideOf(current, target) };
  const blend = (mode: string) => target.context.register(target.context.obj({ Type: "ExtGState", BM: mode }));
  const states = { gray: blend("Saturation"), tint: blend("Lighten"), multiply: blend("Multiply") };
  const layer = (name: string) => target.context.register(target.context.obj({ Type: "OCG", Name: PDFHexString.fromText(name) }));
  const layers = { previous: layer(layerName(PREVIOUS_LAYER, options.previousName)), current: layer(layerName(CURRENT_LAYER, options.currentName)) };
  const pagesRef = target.catalog.get(key("Pages")) as PDFRef;
  const pageRefs: PDFRef[] = [];
  const labels: string[] = [];
  const clouds: Markup[] = [];
  const date = pdfDate(new Date());

  for (const [done, sheet] of options.sheets.entries()) {
    onProgress?.({ done, total: options.sheets.length });
    const before = sheet.previous === null ? null : embedPage(target, sides.previous, sheet.previous);
    const after = sheet.current === null ? null : embedPage(target, sides.current, sheet.current);
    const base = after ?? before;
    if (!base) {
      continue;
    }
    const { width, height } = base.view;
    labels.push(sheet.label);
    for (const box of sheet.changes ?? []) {
      const corners = [box.left, box.bottom, box.right, box.top].map((value) => value / base.unit);
      clouds.push(newMarkup({ id: `markup-${crypto.randomUUID()}`, pageIndex: pageRefs.length, kind: "cloud", box: corners, subject: CHANGE_SUBJECT }, CHANGE_STYLE, date));
    }
    const xObjects: Record<string, PDFRef> = {};
    const properties: Record<string, PDFRef> = {};
    const content = [`q 1 1 1 rg 0 0 ${numbers([width, height])} re f Q`];
    const draw = (name: "Previous" | "Current", page: EmbeddedPage, placement: Matrix, color: Rgb, ocg: PDFRef) => {
      xObjects[name] = tintedLayer(target, page, placement, color, width, height, states);
      properties[name] = ocg;
      content.push(`/OC /${name} BDC q /Multiply gs /${name} Do Q EMC`);
    };
    if (before) {
      const alignment = after ? multiply(multiply(scaled(before.unit), sheet.alignment ?? centered(physical(before), physical(after))), scaled(1 / after.unit)) : IDENTITY;
      draw("Previous", before, placedOn(before.view, alignment), options.previous, layers.previous);
    }
    if (after) {
      draw("Current", after, after.view.matrix, options.current, layers.current);
    }
    const contents = target.context.register(target.context.flateStream(content.join("\n")));
    pageRefs.push(
      target.context.register(
        target.context.obj({
          Type: "Page",
          Parent: pagesRef,
          MediaBox: [0, 0, width, height],
          Contents: contents,
          Resources: { XObject: xObjects, ExtGState: { Multiply: states.multiply }, Properties: properties },
          Group: { Type: "Group", S: "Transparency", CS: "DeviceRGB" },
          ...(base.unit === 1 ? {} : { UserUnit: base.unit }),
        }),
      ),
    );
  }

  if (!pageRefs.length) {
    throw new PageEditError("There are no pages to overlay.");
  }
  setPageRefs(target, pageRefs);
  const inside = { previous: sourceLayers(sides.previous), current: sourceLayers(sides.current) };
  const nested = (layers: PDFRef[]) => (layers.length ? [layers] : []);
  target.catalog.set(
    key("OCProperties"),
    target.context.obj({
      OCGs: [layers.previous, ...inside.previous.all, layers.current, ...inside.current.all],
      D: {
        Name: PDFHexString.fromText("Overlay"),
        Order: [layers.previous, ...nested(inside.previous.all), layers.current, ...nested(inside.current.all)],
        OFF: [...inside.previous.hidden, ...inside.current.hidden],
      },
    }),
  );
  writePageLabels(target, labels);
  applyMarkup(target, clouds, pageRefs);
  onProgress?.({ done: options.sheets.length, total: options.sheets.length });
  return { doc: target, pages: pageRefs };
}
