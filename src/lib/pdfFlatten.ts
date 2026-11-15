import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from "@cantoo/pdf-lib";
import { appearanceOf, drawAppearance, flattenForm } from "./pdfForm";

const key = PDFName.of;
const HIDDEN = 1 << 1;
const PRINT = 1 << 2;
const LEFT_ALONE = new Set([key("Widget"), key("Link"), key("Popup")]);

function prints(annotation: PDFDict) {
  const flags = annotation.lookup(key("F"));
  const value = flags instanceof PDFNumber ? flags.asNumber() : 0;
  return (value & PRINT) !== 0 && (value & HIDDEN) === 0;
}

export function flattenAnnotations(doc: PDFDocument) {
  let flattened = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(key("Annots"));
    if (!(annots instanceof PDFArray)) {
      continue;
    }
    for (let index = 0; index < annots.size(); ) {
      const entry = annots.get(index);
      const annotation = entry instanceof PDFRef ? doc.context.lookup(entry) : entry;
      const subtype = annotation instanceof PDFDict ? annotation.lookup(key("Subtype")) : undefined;
      const appearance = annotation instanceof PDFDict && subtype instanceof PDFName && !LEFT_ALONE.has(subtype) && prints(annotation) ? appearanceOf(doc, annotation) : null;
      if (!(annotation instanceof PDFDict) || !appearance) {
        index++;
        continue;
      }
      drawAppearance(doc, page, annotation, appearance);
      annots.remove(index);
      flattened++;
    }
  }
  return flattened;
}

export async function flattenForPrint(doc: PDFDocument) {
  await flattenForm(doc);
  flattenAnnotations(doc);
}
