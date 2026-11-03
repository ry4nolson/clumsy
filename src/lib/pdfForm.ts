import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFRef,
  PDFStream,
  PDFTextField,
  StandardFonts,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFFont,
  type PDFPage,
} from "@cantoo/pdf-lib";
import { acroForm, detach, dropXfa, pruneFields } from "./pdfStructure";
import { pruneIdTree, pruneStructTree } from "./pdfStructTree";

export type Matrix = [number, number, number, number, number, number];

const key = PDFName.of;
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const HIDDEN = 1 << 1;
const NO_VIEW = 1 << 5;
const PUSH_BUTTON = 1 << 16;
const MAX_FIELD_DEPTH = 32;

export function appearanceTransform(rect: number[], bbox: number[], matrix: Matrix = IDENTITY): Matrix | null {
  const [a, b, c, d, e, f] = matrix;
  const corners = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[0], bbox[3]],
    [bbox[2], bbox[3]],
  ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const left = Math.min(rect[0], rect[2]);
  const bottom = Math.min(rect[1], rect[3]);
  const width = Math.abs(rect[2] - rect[0]);
  const height = Math.abs(rect[3] - rect[1]);
  if (!(maxX > minX && maxY > minY && width > 0 && height > 0)) {
    return null;
  }
  const scaleX = width / (maxX - minX);
  const scaleY = height / (maxY - minY);
  return [scaleX, 0, 0, scaleY, left - minX * scaleX, bottom - minY * scaleY];
}

function numbers(array: PDFArray | undefined, length: number) {
  const values = array?.asArray().map((_, index) => {
    const value = array.lookup(index);
    return value instanceof PDFNumber ? value.asNumber() : NaN;
  });
  return values?.length === length && values.every(Number.isFinite) ? values : null;
}

const attempt = (run: () => void) => {
  try {
    run();
    return true;
  } catch {
    return false;
  }
};

function hasAppearance(widget: PDFDict) {
  const appearances = widget.lookup(key("AP"));
  return appearances instanceof PDFDict && appearances.has(key("N"));
}

async function refreshAppearances(doc: PDFDocument) {
  const stale = new Set<PDFRef>();
  const form = acroForm(doc);
  if (!form) {
    return stale;
  }
  const needAppearances = form.lookup(key("NeedAppearances"));
  const regenerate = needAppearances instanceof PDFBool && needAppearances.asBoolean();
  let font: PDFFont | null = null;
  const fields = (() => {
    try {
      return doc.getForm().getFields();
    } catch {
      return [];
    }
  })();
  for (const field of fields) {
    const widgets = field.acroField.getWidgets();
    const outdated = regenerate && (field instanceof PDFTextField || field instanceof PDFDropdown || field instanceof PDFOptionList);
    if (!outdated && widgets.every((widget) => hasAppearance(widget.dict))) {
      continue;
    }
    font ??= await doc.embedFont(StandardFonts.Helvetica);
    const helvetica = font;
    if (!attempt(() => field.defaultUpdateAppearances(helvetica)) && outdated) {
      widgets.forEach((widget) => {
        const ref = doc.context.getObjectRef(widget.dict);
        if (ref) {
          stale.add(ref);
        }
      });
    }
  }
  await doc.flush();
  return stale;
}

function inherited(widget: PDFDict, name: string) {
  let node: PDFDict | undefined = widget;
  for (let depth = 0; node && depth < MAX_FIELD_DEPTH; depth++) {
    const value = node.lookup(key(name));
    if (value !== undefined) {
      return value;
    }
    const parent: unknown = node.lookup(key("Parent"));
    node = parent instanceof PDFDict ? parent : undefined;
  }
  return undefined;
}

function drawsNothing(widget: PDFDict) {
  const type = inherited(widget, "FT");
  const flags = inherited(widget, "Ff");
  return type === key("Sig") || (type === key("Btn") && flags instanceof PDFNumber && (flags.asNumber() & PUSH_BUTTON) !== 0);
}

function streamRef(doc: PDFDocument, entry: unknown) {
  const stream = entry instanceof PDFRef ? doc.context.lookup(entry) : entry;
  if (!(stream instanceof PDFStream)) {
    return null;
  }
  return entry instanceof PDFRef ? entry : doc.context.register(stream);
}

function appearanceOf(doc: PDFDocument, widget: PDFDict): PDFRef | null | undefined {
  const appearances = widget.lookup(key("AP"));
  const normal = appearances instanceof PDFDict ? appearances.get(key("N")) : undefined;
  const resolved = normal && doc.context.lookup(normal);
  if (resolved instanceof PDFStream) {
    return streamRef(doc, normal);
  }
  if (resolved instanceof PDFDict) {
    const state = widget.lookup(key("AS")) ?? inherited(widget, "V");
    return state instanceof PDFName ? streamRef(doc, resolved.get(state)) : null;
  }
  return drawsNothing(widget) ? null : undefined;
}

function drawAppearance(doc: PDFDocument, page: PDFPage, widget: PDFDict, ref: PDFRef) {
  const stream = doc.context.lookup(ref, PDFStream);
  const rect = numbers(widget.lookup(key("Rect")) as PDFArray | undefined, 4);
  const bbox = numbers(stream.dict.lookup(key("BBox")) as PDFArray | undefined, 4);
  const matrix = numbers(stream.dict.lookup(key("Matrix")) as PDFArray | undefined, 6) ?? IDENTITY;
  const transform = rect && bbox && appearanceTransform(rect, bbox, matrix as Matrix);
  if (!transform) {
    return;
  }
  if (!stream.dict.has(key("Subtype"))) {
    stream.dict.set(key("Subtype"), key("Form"));
  }
  const name = page.node.newXObject("FlatWidget", ref);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...transform), drawObject(name), popGraphicsState());
}

export async function flattenForm(doc: PDFDocument) {
  const stale = await refreshAppearances(doc);
  const flattened = new Set<PDFRef>();
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(key("Annots"));
    if (!(annots instanceof PDFArray)) {
      continue;
    }
    for (let index = 0; index < annots.size(); index++) {
      const ref = annots.get(index);
      const widget = ref instanceof PDFRef ? doc.context.lookup(ref) : null;
      if (!(ref instanceof PDFRef) || stale.has(ref) || !(widget instanceof PDFDict) || widget.lookup(key("Subtype")) !== key("Widget")) {
        continue;
      }
      const flags = widget.lookup(key("F"));
      const hidden = flags instanceof PDFNumber && (flags.asNumber() & (HIDDEN | NO_VIEW)) !== 0;
      const appearance = hidden ? null : appearanceOf(doc, widget);
      if (appearance === undefined) {
        continue;
      }
      if (appearance) {
        drawAppearance(doc, page, widget, appearance);
      }
      flattened.add(ref);
    }
    for (let index = annots.size() - 1; index >= 0; index--) {
      const ref = annots.get(index);
      if (ref instanceof PDFRef && flattened.has(ref)) {
        annots.remove(index);
      }
    }
  }
  if (!flattened.size) {
    return 0;
  }
  const removedFields = pruneFields(doc, flattened);
  const removedElements = pruneStructTree(doc, flattened);
  pruneIdTree(doc, removedElements);
  detach(doc, new Set([...flattened, ...removedFields, ...removedElements]));
  dropXfa(doc);
  const fields = acroForm(doc)?.lookup(key("Fields"));
  if (!(fields instanceof PDFArray) || fields.size() === 0) {
    doc.catalog.delete(key("AcroForm"));
  }
  return flattened.size;
}
