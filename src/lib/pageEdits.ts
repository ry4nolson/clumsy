import { EncryptedPDFError, PDFDocument, PDFName, PDFNumber, PDFPageLeaf, degrees } from "@cantoo/pdf-lib";

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

const save = (doc: PDFDocument) => doc.save({ updateFieldAppearances: false });

function setPageOrder(doc: PDFDocument, order: number[]) {
  const pages = doc.getPages();
  const rootRef = doc.catalog.get(PDFName.of("Pages"));
  for (const page of pages) {
    for (const name of PDFPageLeaf.InheritableEntries) {
      const key = PDFName.of(name);
      const inherited = page.node.getInheritableAttribute(key);
      if (inherited && !page.node.get(key)) {
        page.node.set(key, inherited);
      }
    }
    page.node.set(PDFName.of("Parent"), rootRef!);
  }
  const root = doc.catalog.Pages();
  root.set(PDFName.of("Kids"), doc.context.obj(order.map((index) => pages[index].ref)));
  root.set(PDFName.of("Count"), PDFNumber.of(order.length));
}

export async function pageCount(bytes: Uint8Array) {
  return (await load(bytes)).getPageCount();
}

export async function applyPageEdit(bytes: Uint8Array, edit: PageEdit) {
  const doc = await load(bytes);
  const pages = doc.getPages();
  switch (edit.kind) {
    case "move":
      setPageOrder(doc, reorderedPages(pages.length, edit.pages, edit.to));
      break;
    case "delete": {
      const doomed = uniqueSorted(edit.pages).filter((page) => page >= 0 && page < pages.length);
      if (doomed.length >= pages.length) {
        throw new PageEditError("A PDF needs at least one page.");
      }
      for (const page of doomed.reverse()) {
        doc.removePage(page);
      }
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
      const source = await load(edit.data);
      const copied = await doc.copyPages(source, source.getPageIndices());
      const at = Math.min(Math.max(0, edit.at), pages.length);
      copied.forEach((page, index) => doc.insertPage(at + index, page));
      break;
    }
  }
  return save(doc);
}

export async function extractPages(bytes: Uint8Array, pages: number[]) {
  const source = await load(bytes);
  const doc = await PDFDocument.create({ updateMetadata: false });
  const indices = uniqueSorted(pages).filter((page) => page >= 0 && page < source.getPageCount());
  for (const page of await doc.copyPages(source, indices)) {
    doc.addPage(page);
  }
  return save(doc);
}

export async function combinePdfs(files: Uint8Array[]) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (const bytes of files) {
    const source = await load(bytes);
    for (const page of await doc.copyPages(source, source.getPageIndices())) {
      doc.addPage(page);
    }
  }
  return save(doc);
}
