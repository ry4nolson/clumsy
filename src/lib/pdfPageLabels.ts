import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, type PDFObject } from "@cantoo/pdf-lib";
import { encodePageLabels, labelsFromRanges, type LabelRange, type LabelStyle } from "./pageLabels";

const key = PDFName.of;
const styles = new Set<string>(["D", "R", "r", "A", "a"]);

function collectRanges(doc: PDFDocument, node: PDFObject | undefined, ranges: LabelRange[], seen: Set<PDFObject>) {
  const dict = node instanceof PDFRef ? doc.context.lookup(node) : node;
  if (!(dict instanceof PDFDict) || seen.has(dict)) {
    return;
  }
  seen.add(dict);
  const nums = dict.lookup(key("Nums"));
  if (nums instanceof PDFArray) {
    for (let index = 0; index + 1 < nums.size(); index += 2) {
      const start = nums.lookup(index);
      const value = nums.lookup(index + 1);
      if (!(start instanceof PDFNumber) || !(value instanceof PDFDict)) {
        continue;
      }
      const style = value.lookup(key("S"));
      const prefix = value.lookup(key("P"));
      const first = value.lookup(key("St"));
      const name = style instanceof PDFName ? style.decodeText() : null;
      ranges.push({
        start: start.asNumber(),
        style: name && styles.has(name) ? (name as LabelStyle) : null,
        prefix: prefix instanceof PDFString || prefix instanceof PDFHexString ? prefix.decodeText() : "",
        first: first instanceof PDFNumber && first.asNumber() >= 1 ? Math.floor(first.asNumber()) : 1,
      });
    }
  }
  const kids = dict.lookup(key("Kids"));
  if (kids instanceof PDFArray) {
    kids.asArray().forEach((kid) => collectRanges(doc, kid, ranges, seen));
  }
}

export function readPageLabels(doc: PDFDocument, count = doc.getPageCount()): string[] | null {
  const tree = doc.catalog.get(key("PageLabels"));
  if (!tree) {
    return null;
  }
  const ranges: LabelRange[] = [];
  collectRanges(doc, tree, ranges, new Set());
  return ranges.length ? labelsFromRanges(ranges, count) : null;
}

export function writePageLabels(doc: PDFDocument, labels: string[] | null) {
  if (!labels?.length) {
    doc.catalog.delete(key("PageLabels"));
    return;
  }
  const nums = encodePageLabels(labels).flatMap((range) => {
    const entry = doc.context.obj({});
    if (range.style) {
      entry.set(key("S"), key(range.style));
    }
    if (range.prefix) {
      entry.set(key("P"), PDFHexString.fromText(range.prefix));
    }
    if (range.style && range.first !== 1) {
      entry.set(key("St"), PDFNumber.of(range.first));
    }
    return [PDFNumber.of(range.start), entry];
  });
  doc.catalog.set(key("PageLabels"), doc.context.obj({ Nums: nums }));
}

export const pageRefsOf = (doc: PDFDocument) => doc.catalog.Pages().lookup(key("Kids"), PDFArray).asArray() as PDFRef[];

export type LabelSource = { refs: PDFRef[]; labels: string[] | null };

export function relabelPages(doc: PDFDocument, before: LabelSource, after: PDFRef[], extra: LabelSource[] = []) {
  if (!before.labels) {
    doc.catalog.delete(key("PageLabels"));
    return;
  }
  const byRef = new Map<PDFRef, string>();
  for (const source of [before, ...extra]) {
    source.refs.forEach((ref, index) => {
      const label = source.labels?.[index];
      if (label !== undefined) {
        byRef.set(ref, label);
      }
    });
  }
  writePageLabels(
    doc,
    after.map((ref, index) => byRef.get(ref) ?? String(index + 1)),
  );
}
