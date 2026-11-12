import { PDFArray, PDFBool, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, type PDFContext, type PDFDocument, type PDFObject } from "@cantoo/pdf-lib";
import { STAMP_NAME_PREFIX, isLineKind, isTextKind, kindLabels, quadsBox, type Markup, type MarkupKind } from "./markup";
import { addAppearance, boldFontDict, winAnsiSafe } from "./markupAppearance";
import { boxFromRect, orientedQuads, outerRect, outsetOf } from "./markupShapes";
import { pageLeafRefs } from "./pdfStructure";
import { stampDesign, stampLabel } from "./stampSymbols";

const PRINT = 4;
const SKIPPED_FLAGS = 2 | 32 | 64 | 128;
const DATE_KEY = PDFName.of("ClumsyDate");
const FILL_ALPHA_KEY = PDFName.of("ClumsyFillAlpha");

const name = (value: string) => PDFName.of(value);

export const idOfRef = (ref: PDFRef) => (ref.generationNumber ? `${ref.objectNumber}R${ref.generationNumber}` : `${ref.objectNumber}R`);

export function refFromId(id: string) {
  const match = /^(\d+)R(\d*)$/.exec(id);
  return match ? PDFRef.of(Number(match[1]), Number(match[2] || 0)) : null;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const numbers = (context: PDFContext, values: number[]) => context.obj(values.map(round));

const subtypeOf = (kind: MarkupKind) =>
  ({ rectangle: "Square", cloud: "Square", ellipse: "Circle", line: "Line", arrow: "Line", underline: "Underline", strikeout: "StrikeOut", stamp: "Stamp" })[kind];

function borderStyle(context: PDFContext, markup: Markup, existing?: PDFDict) {
  const style = existing ? (existing.clone(context) as PDFDict) : context.obj({});
  style.set(name("W"), PDFNumber.of(round(markup.width)));
  if (markup.dash?.length) {
    style.set(name("S"), name("D"));
    style.set(name("D"), numbers(context, markup.dash));
  } else if (!existing) {
    style.set(name("S"), name("S"));
  }
  return style;
}

function setGeometry(context: PDFContext, dict: PDFDict, markup: Markup, rect: number[]) {
  dict.set(name("Rect"), numbers(context, rect));
  if (isLineKind(markup.kind) && markup.line) {
    dict.set(name("L"), numbers(context, markup.line));
  } else if (isTextKind(markup.kind) && markup.quads) {
    dict.set(name("QuadPoints"), numbers(context, markup.quads));
  } else if (markup.kind !== "stamp") {
    const inset = outsetOf(markup);
    dict.set(name("RD"), numbers(context, [inset, inset, inset, inset]));
  }
}

function setStyle(context: PDFContext, dict: PDFDict, markup: Markup) {
  dict.set(name("C"), numbers(context, markup.color));
  dict.set(name("CA"), PDFNumber.of(round(markup.opacity)));
  if (markup.fill) {
    dict.set(name("IC"), numbers(context, markup.fill));
  } else if (!isLineKind(markup.kind)) {
    dict.delete(name("IC"));
  }
  if (markup.fill && markup.fillAlpha < 1 && !isLineKind(markup.kind)) {
    dict.set(FILL_ALPHA_KEY, PDFNumber.of(round(markup.fillAlpha)));
  } else {
    dict.delete(FILL_ALPHA_KEY);
  }
  if (markup.kind !== "stamp") {
    dict.set(name("BS"), borderStyle(context, markup, dict.lookupMaybe(name("BS"), PDFDict)));
    dict.delete(name("Border"));
  }
}

type Writer = { context: PDFContext; font: () => PDFRef };

function setAppearance({ context, font }: Writer, dict: PDFDict, markup: Markup, rect: number[]) {
  dict.set(name("AP"), context.obj({ N: addAppearance(context, markup, rect, font) }));
}

function addMarkup(writer: Writer, pageRef: PDFRef, page: PDFDict, markup: Markup) {
  const { context } = writer;
  const rect = outerRect(markup);
  const date = PDFString.of(markup.date ?? "");
  const dict = context.obj({
    Type: "Annot",
    Subtype: subtypeOf(markup.kind),
    P: pageRef,
    NM: PDFString.of(markup.id),
    F: PRINT,
    M: date,
    CreationDate: date,
    Subj: PDFHexString.fromText(markup.kind === "stamp" && markup.stamp ? stampLabel(markup.stamp) : kindLabels[markup.kind]),
  });
  setGeometry(context, dict, markup, rect);
  setStyle(context, dict, markup);
  if (markup.kind === "cloud") {
    dict.set(name("BE"), context.obj({ S: "C", I: 1.5 }));
  }
  if (isLineKind(markup.kind)) {
    dict.set(name("LE"), context.obj((markup.endings ?? ["None", "None"]).map(name)));
  }
  if (markup.kind === "stamp" && markup.stamp) {
    dict.set(name("Name"), name(`${STAMP_NAME_PREFIX}${markup.stamp}`));
    if (markup.rotation) {
      dict.set(name("Rotate"), PDFNumber.of(markup.rotation));
    }
    if (markup.stampDate) {
      dict.set(DATE_KEY, PDFString.of(winAnsiSafe(markup.stampDate)));
    }
  }
  setAppearance(writer, dict, markup, rect);
  annotsOf(context, page).push(context.register(dict));
}

const annotsOf = (context: PDFContext, page: PDFDict) => {
  const annots = page.lookupMaybe(name("Annots"), PDFArray);
  if (annots) {
    return annots;
  }
  const created = context.obj([]);
  page.set(name("Annots"), created);
  return created;
};

function rectOf(dict: PDFDict | undefined, key = "Rect") {
  const values = numbersOf(dict?.lookupMaybe(name(key), PDFArray));
  if (values?.length !== 4) {
    return null;
  }
  const [x1, y1, x2, y2] = values;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

function numbersOf(array: PDFArray | undefined) {
  const values = array?.asArray().map((_, index) => array.lookupMaybe(index, PDFNumber)?.asNumber());
  return values && !values.some((value) => value === undefined) ? (values as number[]) : null;
}

function movePopup(context: PDFContext, dict: PDFDict, before: number[] | null, after: number[]) {
  const popup = dict.lookupMaybe(name("Popup"), PDFDict);
  const popupRect = rectOf(popup);
  if (!before || !popup || !popupRect) {
    return;
  }
  const [dx, dy] = [after[0] - before[0], after[3] - before[3]];
  if (dx || dy) {
    popup.set(name("Rect"), numbers(context, popupRect.map((value, index) => value + (index % 2 ? dy : dx))));
  }
}

function updateMarkup(writer: Writer, dict: PDFDict, markup: Markup) {
  const { context } = writer;
  const original = markupFromDict(dict, markup.id, markup.pageIndex, { anyFlags: true });
  const before = original ? outerRect(original) : rectOf(dict);
  const keepsAppearance = markup.kind === "stamp" && !(markup.stamp && stampDesign(markup.stamp));
  const rect = keepsAppearance ? markup.box : outerRect(markup);
  setGeometry(context, dict, markup, rect);
  setStyle(context, dict, markup);
  if (markup.date) {
    dict.set(name("M"), PDFString.of(markup.date));
  }
  movePopup(context, dict, before, rect);
  if (!keepsAppearance) {
    setAppearance(writer, dict, markup, rect);
  }
}

export function removeAnnotation(context: PDFContext, page: PDFDict, ref: PDFRef, dict: PDFDict) {
  const gone = new Set<PDFRef>([ref]);
  const annots = page.lookupMaybe(name("Annots"), PDFArray);
  const entries = (annots?.asArray() ?? []).map((entry) => [entry, entry instanceof PDFRef ? context.lookupMaybe(entry, PDFDict) : undefined] as const);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [entry, annotation] of entries) {
      const parent = annotation?.get(name("IRT"));
      if (entry instanceof PDFRef && !gone.has(entry) && parent instanceof PDFRef && gone.has(parent)) {
        gone.add(entry);
        grew = true;
      }
    }
  }
  for (const doomed of [...gone]) {
    const popup = (doomed === ref ? dict : context.lookupMaybe(doomed, PDFDict))?.get(name("Popup"));
    if (popup instanceof PDFRef) {
      gone.add(popup);
    }
  }
  for (let index = (annots?.size() ?? 0) - 1; index >= 0; index--) {
    const entry = annots!.get(index);
    if (entry instanceof PDFRef && gone.has(entry)) {
      annots!.remove(index);
    }
  }
  gone.forEach((doomed) => context.delete(doomed));
}

export function applyMarkup(doc: PDFDocument, markup: Markup[], pages = pageLeafRefs(doc)) {
  const { context } = doc;
  let fontRef: PDFRef | null = null;
  const writer: Writer = { context, font: () => (fontRef ??= boldFontDict(context)) };
  for (const change of markup) {
    const pageRef = pages[change.pageIndex];
    const page = pageRef && context.lookupMaybe(pageRef, PDFDict);
    if (!page) {
      continue;
    }
    if (change.fresh) {
      if (!change.deleted) {
        addMarkup(writer, pageRef, page, change);
      }
      continue;
    }
    const ref = refFromId(change.id);
    const existing = ref && context.lookupMaybe(ref, PDFDict);
    if (!existing) {
      continue;
    }
    if (change.deleted) {
      removeAnnotation(context, page, ref, existing);
    } else {
      updateMarkup(writer, existing, change);
    }
  }
}

function rgbOf(array: PDFArray | undefined) {
  const values = numbersOf(array);
  if (!values?.length) {
    return null;
  }
  if (values.length === 1) {
    return [values[0], values[0], values[0]];
  }
  if (values.length === 4) {
    const [c, m, y, k] = values;
    return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
  }
  return values.slice(0, 3);
}

function borderOf(dict: PDFDict) {
  const style = dict.lookupMaybe(name("BS"), PDFDict);
  const border = dict.lookupMaybe(name("Border"), PDFArray);
  const borderDash = border?.size() === 4 ? numbersOf(border.lookupMaybe(3, PDFArray)) : null;
  const width = style?.lookupMaybe(name("W"), PDFNumber)?.asNumber() ?? border?.lookupMaybe(2, PDFNumber)?.asNumber() ?? 1;
  const dashed = style ? style.get(name("S")) === name("D") : !!borderDash?.length;
  const dash = dashed ? ((style ? numbersOf(style.lookupMaybe(name("D"), PDFArray)) : borderDash) ?? [3]) : null;
  const transparent = numbersOf(dict.lookupMaybe(name("C"), PDFArray))?.length === 0;
  return { width: transparent ? 0 : width, dash };
}

function kindOf(dict: PDFDict): MarkupKind | null {
  const subtype = dict.lookupMaybe(name("Subtype"), PDFName)?.decodeText();
  switch (subtype) {
    case "Square":
      return dict.lookupMaybe(name("BE"), PDFDict)?.get(name("S")) === name("C") ? "cloud" : "rectangle";
    case "Circle":
      return "ellipse";
    case "Line": {
      const endings = dict.lookupMaybe(name("LE"), PDFArray)?.asArray() ?? [];
      return endings.some((ending) => ending instanceof PDFName && ending !== name("None")) ? "arrow" : "line";
    }
    case "Underline":
      return "underline";
    case "StrikeOut":
      return "strikeout";
    case "Stamp":
      return dict.lookupMaybe(name("Name"), PDFName)?.decodeText().startsWith(STAMP_NAME_PREFIX) ? "stamp" : null;
    default:
      return null;
  }
}

const textOf = (value: PDFObject | undefined) => (value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : null);

const isMeasurement = (dict: PDFDict) =>
  dict.has(name("Measure")) ||
  dict.has(name("IT")) ||
  dict.lookupMaybe(name("Cap"), PDFBool)?.asBoolean() === true ||
  !!dict.lookupMaybe(name("LL"), PDFNumber)?.asNumber() ||
  !!dict.lookupMaybe(name("LLO"), PDFNumber)?.asNumber();

export function markupFromDict(dict: PDFDict, id: string, pageIndex: number, { anyFlags = false, pageRotation = 0 } = {}): Markup | null {
  const kind = kindOf(dict);
  const rect = rectOf(dict);
  const flags = dict.lookupMaybe(name("F"), PDFNumber)?.asNumber() ?? 0;
  if (!kind || !rect || dict.has(name("IRT")) || (!anyFlags && flags & SKIPPED_FLAGS) || (isLineKind(kind) && isMeasurement(dict))) {
    return null;
  }
  const { width, dash } = borderOf(dict);
  const line = isLineKind(kind) ? numbersOf(dict.lookupMaybe(name("L"), PDFArray)) : null;
  const rawQuads = isTextKind(kind) ? numbersOf(dict.lookupMaybe(name("QuadPoints"), PDFArray)) : null;
  const quads = rawQuads && orientedQuads(rawQuads, pageRotation);
  if ((isLineKind(kind) && line?.length !== 4) || (isTextKind(kind) && (!quads || quads.length < 8))) {
    return null;
  }
  const inner = numbersOf(dict.lookupMaybe(name("RD"), PDFArray));
  const box = line ? [Math.min(line[0], line[2]), Math.min(line[1], line[3]), Math.max(line[0], line[2]), Math.max(line[1], line[3])] : quads ? quadsBox(quads) : boxFromRect(kind, rect, width, inner?.length === 4 ? inner : null);
  const stampName = kind === "stamp" ? dict.lookupMaybe(name("Name"), PDFName)!.decodeText().slice(STAMP_NAME_PREFIX.length) : null;
  return {
    id,
    pageIndex,
    kind,
    box: kind === "stamp" ? rect : box,
    line,
    quads,
    color: rgbOf(dict.lookupMaybe(name("C"), PDFArray)) ?? [0, 0, 0],
    fill: rgbOf(dict.lookupMaybe(name("IC"), PDFArray)),
    fillAlpha: dict.lookupMaybe(FILL_ALPHA_KEY, PDFNumber)?.asNumber() ?? 1,
    width: kind === "stamp" ? 0 : width,
    opacity: dict.lookupMaybe(name("CA"), PDFNumber)?.asNumber() ?? 1,
    dash,
    endings: isLineKind(kind) ? (dict.lookupMaybe(name("LE"), PDFArray)?.asArray() ?? []).map((ending) => (ending instanceof PDFName ? ending.decodeText() : "None")) : null,
    stamp: stampName,
    stampDate: textOf(dict.get(DATE_KEY)),
    rotation: dict.lookupMaybe(name("Rotate"), PDFNumber)?.asNumber() ?? 0,
    date: textOf(dict.get(name("M"))),
    fresh: false,
    deleted: false,
  };
}

function rotationOf(page: PDFDict) {
  const seen = new Set<PDFDict>();
  for (let node: PDFDict | undefined = page; node && !seen.has(node); node = node.lookupMaybe(name("Parent"), PDFDict)) {
    seen.add(node);
    const rotate = node.lookupMaybe(name("Rotate"), PDFNumber);
    if (rotate) {
      return rotate.asNumber();
    }
  }
  return 0;
}

export function readMarkup(doc: PDFDocument): Markup[] {
  const { context } = doc;
  const found: Markup[] = [];
  pageLeafRefs(doc).forEach((pageRef, pageIndex) => {
    const page = context.lookupMaybe(pageRef, PDFDict);
    const annots = page?.lookupMaybe(name("Annots"), PDFArray);
    const pageRotation = page ? rotationOf(page) : 0;
    for (const entry of annots?.asArray() ?? []) {
      const dict = entry instanceof PDFRef ? context.lookupMaybe(entry, PDFDict) : undefined;
      const markup = dict && markupFromDict(dict, idOfRef(entry as PDFRef), pageIndex, { pageRotation });
      if (markup) {
        found.push(markup);
      }
    }
  });
  return found;
}
