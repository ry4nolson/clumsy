import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFNumber } from "@cantoo/pdf-lib";
import { PageEditError, applyPageEdit, combinePdfs, countAfterEdit, extractPages, pageAfterEdit, pageRanges, reorderedPages, selectionAfterEdit } from "../src/lib/pageEdits";

async function makePdf(widths: number[], extra?: (doc: PDFDocument) => void) {
  const doc = await PDFDocument.create();
  for (const width of widths) {
    doc.addPage([width, 800]);
  }
  extra?.(doc);
  return doc.save();
}

async function describePdf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => `${page.getWidth()}${page.getRotation().angle ? `@${page.getRotation().angle}` : ""}`);
}

describe("reorderedPages", () => {
  it("moves a page forward and back", () => {
    expect(reorderedPages(5, [0], 3)).toEqual([1, 2, 0, 3, 4]);
    expect(reorderedPages(5, [4], 1)).toEqual([0, 4, 1, 2, 3]);
  });

  it("keeps a multi-page selection together in page order", () => {
    expect(reorderedPages(6, [4, 1], 6)).toEqual([0, 2, 3, 5, 1, 4]);
    expect(reorderedPages(6, [3, 4], 0)).toEqual([3, 4, 0, 1, 2, 5]);
  });

  it("treats dropping a page next to itself as no move", () => {
    expect(reorderedPages(4, [2], 2)).toEqual([0, 1, 2, 3]);
    expect(reorderedPages(4, [2], 3)).toEqual([0, 1, 2, 3]);
  });

  it("ignores pages out of range and clamps the slot", () => {
    expect(reorderedPages(3, [7, 0], 99)).toEqual([1, 2, 0]);
  });
});

describe("pageAfterEdit", () => {
  it("follows the current page through edits", () => {
    expect(pageAfterEdit({ kind: "move", pages: [0], to: 3 }, 0, 5)).toBe(2);
    expect(pageAfterEdit({ kind: "move", pages: [0], to: 3 }, 1, 5)).toBe(0);
    expect(pageAfterEdit({ kind: "delete", pages: [1, 2] }, 2, 5)).toBe(1);
    expect(pageAfterEdit({ kind: "delete", pages: [3, 4] }, 4, 5)).toBe(2);
    expect(pageAfterEdit({ kind: "rotate", pages: [0], by: 90 }, 3, 5)).toBe(3);
    expect(pageAfterEdit({ kind: "insert", data: new Uint8Array(), at: 2 }, 2, 5, 3)).toBe(5);
    expect(pageAfterEdit({ kind: "insert", data: new Uint8Array(), at: 2 }, 1, 5, 3)).toBe(1);
  });
});

describe("countAfterEdit and selectionAfterEdit", () => {
  const data = new Uint8Array();
  it("tracks the page count", () => {
    expect(countAfterEdit({ kind: "delete", pages: [0, 0, 9] }, 5)).toBe(4);
    expect(countAfterEdit({ kind: "insert", data, at: 0 }, 5, 2)).toBe(7);
    expect(countAfterEdit({ kind: "move", pages: [1], to: 0 }, 5)).toBe(5);
  });

  it("keeps moved, rotated, and inserted pages selected", () => {
    expect(selectionAfterEdit({ kind: "move", pages: [0, 1], to: 4 }, 5)).toEqual([2, 3]);
    expect(selectionAfterEdit({ kind: "rotate", pages: [3, 1], by: 90 }, 5)).toEqual([1, 3]);
    expect(selectionAfterEdit({ kind: "insert", data, at: 2 }, 5, 3)).toEqual([2, 3, 4]);
    expect(selectionAfterEdit({ kind: "delete", pages: [1] }, 5)).toEqual([]);
  });
});

describe("pageRanges", () => {
  it("collapses runs into ranges", () => {
    expect(pageRanges([0, 1, 2, 4, 6, 7])).toBe("1–3, 5, 7–8");
    expect(pageRanges([3])).toBe("4");
  });
});

describe("applyPageEdit", () => {
  it("reorders pages", async () => {
    const bytes = await makePdf([100, 200, 300, 400]);
    expect(await describePdf(await applyPageEdit(bytes, { kind: "move", pages: [3], to: 0 }))).toEqual(["400", "100", "200", "300"]);
  });

  it("deletes pages but never the last one", async () => {
    const bytes = await makePdf([100, 200, 300]);
    expect(await describePdf(await applyPageEdit(bytes, { kind: "delete", pages: [0, 2] }))).toEqual(["200"]);
    await expect(applyPageEdit(bytes, { kind: "delete", pages: [0, 1, 2] })).rejects.toBeInstanceOf(PageEditError);
  });

  it("rotates only the chosen pages and wraps around", async () => {
    const bytes = await makePdf([100, 200]);
    const left = await applyPageEdit(bytes, { kind: "rotate", pages: [1], by: -90 });
    expect(await describePdf(left)).toEqual(["100", "200@270"]);
    expect(await describePdf(await applyPageEdit(left, { kind: "rotate", pages: [1], by: 90 }))).toEqual(["100", "200"]);
  });

  it("inserts another PDF's pages at a position", async () => {
    const bytes = await makePdf([100, 200]);
    const other = await makePdf([500, 600]);
    expect(await describePdf(await applyPageEdit(bytes, { kind: "insert", data: other, at: 1 }))).toEqual(["100", "500", "600", "200"]);
  });

  it("flattens nested page trees without losing inherited page sizes", async () => {
    const doc = await PDFDocument.create();
    const pages = [100, 200, 300].map((width) => doc.addPage([width, 800]));
    const rootRef = doc.catalog.get(PDFName.of("Pages"))!;
    const branchRef = doc.context.register(
      doc.context.obj({ Type: "Pages", Parent: rootRef, Kids: [pages[1].ref, pages[2].ref], Count: 2, MediaBox: [0, 0, 999, 800] }),
    );
    for (const page of pages.slice(1)) {
      page.node.delete(PDFName.of("MediaBox"));
      page.node.set(PDFName.of("Parent"), branchRef);
    }
    doc.catalog.Pages().set(PDFName.of("Kids"), doc.context.obj([pages[0].ref, branchRef]));
    doc.catalog.Pages().set(PDFName.of("Count"), PDFNumber.of(3));
    const nested = await doc.save();
    expect(await describePdf(nested)).toEqual(["100", "999", "999"]);
    expect(await describePdf(await applyPageEdit(nested, { kind: "move", pages: [0], to: 3 }))).toEqual(["999", "999", "100"]);
  });

  it("keeps the outline and form fields when reordering", async () => {
    const bytes = await makePdf([100, 200], (doc) => {
      doc.getForm().createTextField("name").addToPage(doc.getPage(1), { x: 10, y: 10 });
      doc.setTitle("Keep me");
    });
    const moved = await PDFDocument.load(await applyPageEdit(bytes, { kind: "move", pages: [1], to: 0 }));
    expect(moved.getTitle()).toBe("Keep me");
    expect(moved.getForm().getFields().map((field) => field.getName())).toEqual(["name"]);
    expect(moved.getPage(0).node.Annots()?.size()).toBe(1);
  });

  it("explains password-protected files", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.encrypt({ userPassword: "secret", ownerPassword: "owner" });
    const locked = await doc.save();
    await expect(applyPageEdit(locked, { kind: "delete", pages: [0] })).rejects.toThrow(/password-protected/);
  });
});

describe("extractPages and combinePdfs", () => {
  it("extracts selected pages into a new PDF", async () => {
    const bytes = await makePdf([100, 200, 300]);
    expect(await describePdf(await extractPages(bytes, [2, 0]))).toEqual(["100", "300"]);
  });

  it("combines PDFs in order", async () => {
    const first = await makePdf([100]);
    const second = await makePdf([200, 300]);
    expect(await describePdf(await combinePdfs([first, second]))).toEqual(["100", "200", "300"]);
  });
});
