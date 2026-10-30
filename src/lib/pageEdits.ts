import { EncryptedPDFError, PDFDocument, degrees } from "@cantoo/pdf-lib";
import { pageRefsOf, readPageLabels, relabelPages, type LabelSource } from "./pdfPageLabels";
import { collectGarbage, flattenPageTree, importPageRefs, removePageRefs, setPageRefs } from "./pdfStructure";

export type PageEdit =
  | { kind: "move"; pages: number[]; to: number }
  | { kind: "delete"; pages: number[] }
  | { kind: "rotate"; pages: number[]; by: 90 | -90 }
  | { kind: "insert"; data: Uint8Array; at: number };

export class PageEditError extends Error {}

const uniqueSorted = (pages: number[]) => [...new Set(pages)].sort((a, b) => a - b);

export function reorderedPages(count: number, pages: number[], to: number) {
  const moving = uniqueSorted(pages).filter((page) => page >= 0 && page < count);
  const movingSet = new Set(moving);
  const slot = Math.min(Math.max(0, to), count);
  const before = Array.from({ length: slot }, (_, page) => page).filter((page) => !movingSet.has(page));
  const after = Array.from({ length: count - slot }, (_, index) => slot + index).filter((page) => !movingSet.has(page));
  return [...before, ...moving, ...after];
}

export function pageRanges(pages: number[]) {
  const ranges: Array<[number, number]> = [];
  for (const page of uniqueSorted(pages).map((index) => index + 1)) {
    const last = ranges.at(-1);
    if (last && page === last[1] + 1) {
      last[1] = page;
    } else {
      ranges.push([page, page]);
    }
  }
  return ranges.map(([start, end]) => (start === end ? `${start}` : `${start}–${end}`)).join(", ");
}

export function pageAfterEdit(edit: PageEdit, page: number, count: number, insertedCount = 0) {
  switch (edit.kind) {
    case "move":
      return reorderedPages(count, edit.pages, edit.to).indexOf(page);
    case "delete": {
      const deleted = new Set(edit.pages);
      const remaining = Array.from({ length: count }, (_, index) => index).filter((index) => !deleted.has(index));
      const next = remaining.find((index) => index >= page) ?? remaining.at(-1) ?? 0;
      return remaining.indexOf(next);
    }
    case "rotate":
      return page;
    case "insert":
      return page >= edit.at ? page + insertedCount : page;
  }
}

export function countAfterEdit(edit: PageEdit, count: number, insertedCount = 0) {
  switch (edit.kind) {
    case "delete":
      return count - uniqueSorted(edit.pages).filter((page) => page >= 0 && page < count).length;
    case "insert":
      return count + insertedCount;
    default:
      return count;
  }
}

export function selectionAfterEdit(edit: PageEdit, count: number, insertedCount = 0) {
  switch (edit.kind) {
    case "move": {
      const order = reorderedPages(count, edit.pages, edit.to);
      return uniqueSorted(edit.pages).map((page) => order.indexOf(page)).filter((page) => page >= 0);
    }
    case "rotate":
      return uniqueSorted(edit.pages);
    case "insert": {
      const at = Math.min(Math.max(0, edit.at), count);
      return Array.from({ length: insertedCount }, (_, index) => at + index);
    }
    case "delete":
      return [];
  }
}

async function load(bytes: Uint8Array) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw new PageEditError("Pages in password-protected PDFs can't be changed yet.");
    }
    throw error;
  }
}

async function save(doc: PDFDocument) {
  collectGarbage(doc);
  return doc.save({ rewrite: true, addDefaultPage: false, updateFieldAppearances: false });
}

export function changesDocument(edit: PageEdit, count: number) {
  switch (edit.kind) {
    case "move":
      return reorderedPages(count, edit.pages, edit.to).some((page, index) => page !== index);
    case "insert":
      return true;
    default:
      return edit.pages.some((page) => page >= 0 && page < count);
  }
}

export async function pageCount(bytes: Uint8Array) {
  return (await load(bytes)).getPageCount();
}

async function importLabeled(target: PDFDocument, bytes: Uint8Array): Promise<LabelSource> {
  const source = await load(bytes);
  const labels = readPageLabels(source);
  return { refs: importPageRefs(target, source), labels };
}

export async function applyPageEdit(bytes: Uint8Array, edit: PageEdit) {
  const doc = await load(bytes);
  const pages = doc.getPages();
  const labels = readPageLabels(doc);
  const refs = flattenPageTree(doc);
  const extra: LabelSource[] = [];
  switch (edit.kind) {
    case "move":
      setPageRefs(doc, reorderedPages(refs.length, edit.pages, edit.to).map((index) => refs[index]));
      break;
    case "delete": {
      const doomed = new Set(uniqueSorted(edit.pages).filter((page) => page >= 0 && page < refs.length).map((page) => refs[page]));
      if (doomed.size >= refs.length) {
        throw new PageEditError("A PDF needs at least one page.");
      }
      removePageRefs(doc, refs, doomed);
      break;
    }
    case "rotate":
      for (const page of uniqueSorted(edit.pages)) {
        const target = pages[page];
        if (target) {
          target.setRotation(degrees((((target.getRotation().angle + edit.by) % 360) + 360) % 360));
        }
      }
      break;
    case "insert": {
      const inserted = await importLabeled(doc, edit.data);
      const at = Math.min(Math.max(0, edit.at), refs.length);
      setPageRefs(doc, [...refs.slice(0, at), ...inserted.refs, ...refs.slice(at)]);
      extra.push(inserted);
      break;
    }
  }
  if (edit.kind !== "rotate") {
    relabelPages(doc, { refs, labels }, pageRefsOf(doc), extra);
  }
  return save(doc);
}

export async function extractPages(bytes: Uint8Array, pages: number[]) {
  const doc = await load(bytes);
  const labels = readPageLabels(doc);
  const refs = flattenPageTree(doc);
  const keep = new Set(uniqueSorted(pages).filter((page) => page >= 0 && page < refs.length));
  if (!keep.size) {
    throw new PageEditError("No pages to extract.");
  }
  removePageRefs(doc, refs, new Set(refs.filter((_, index) => !keep.has(index))));
  relabelPages(doc, { refs, labels }, pageRefsOf(doc));
  return save(doc);
}

export async function combinePdfs(files: Uint8Array[]) {
  const [first, ...rest] = files;
  const doc = await load(first);
  const labels = readPageLabels(doc);
  const refs = flattenPageTree(doc);
  const extra: LabelSource[] = [];
  for (const bytes of rest) {
    extra.push(await importLabeled(doc, bytes));
  }
  const combined = [...refs, ...extra.flatMap((source) => source.refs)];
  setPageRefs(doc, combined);
  relabelPages(doc, { refs, labels }, combined, extra);
  return save(doc);
}
