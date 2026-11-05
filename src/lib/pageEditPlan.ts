import type { LabelNumbering } from "./pageLabels";

export type PageEdit =
  | { kind: "move"; pages: number[]; to: number }
  | { kind: "delete"; pages: number[] }
  | { kind: "rotate"; pages: number[]; by: 90 | -90 }
  | { kind: "insert"; data: Uint8Array; at: number }
  | { kind: "label"; from: number; to: number; numbering: LabelNumbering | null }
  | { kind: "flatten" };

export class PageEditError extends Error {}

export const uniqueSorted = (pages: number[]) => [...new Set(pages)].sort((a, b) => a - b);

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
    case "label":
    case "flatten":
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
    case "label":
    case "flatten":
      return [];
  }
}

export function changesDocument(edit: PageEdit, count: number) {
  switch (edit.kind) {
    case "move":
      return reorderedPages(count, edit.pages, edit.to).some((page, index) => page !== index);
    case "insert":
    case "label":
    case "flatten":
      return true;
    default:
      return edit.pages.some((page) => page >= 0 && page < count);
  }
}
