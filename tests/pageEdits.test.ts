import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from "@cantoo/pdf-lib";
import { PageEditError, applyPageEdit, changesDocument, combinePdfs, countAfterEdit, extractPages, pageAfterEdit, pageRanges, reorderedPages, selectionAfterEdit } from "../src/lib/pageEdits";

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

const latin1 = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

async function markedPdf(labels: string[]) {
  const doc = await PDFDocument.create();
  for (const label of labels) {
    const page = doc.addPage([400, 800]);
    page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream(`BT /F1 12 Tf 10 10 Td (${label}) Tj ET`)));
  }
  return doc;
}

function pageObjectCount(doc: PDFDocument) {
  return doc.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("Page")).length;
}

function link(doc: PDFDocument, from: number, to: number) {
  const annotation = doc.context.register(
    doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 50, 50], Dest: [doc.getPage(to).ref, PDFName.of("Fit")] }),
  );
  doc.getPage(from).node.set(PDFName.of("Annots"), doc.context.obj([annotation]));
}

function outline(doc: PDFDocument, targets: number[]) {
  const outlinesRef = doc.context.nextRef();
  const refs = targets.map(() => doc.context.nextRef());
  refs.forEach((ref, index) => {
    doc.context.assign(
      ref,
      doc.context.obj({
        Title: PDFString.of(`Go ${targets[index]}`),
        Parent: outlinesRef,
        Dest: [doc.getPage(targets[index]).ref, PDFName.of("Fit")],
        ...(index > 0 ? { Prev: refs[index - 1] } : {}),
        ...(index < refs.length - 1 ? { Next: refs[index + 1] } : {}),
      }),
    );
  });
  doc.context.assign(outlinesRef, doc.context.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: refs.length }));
  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);
}

async function outlineTitles(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const titles: string[] = [];
  const root = doc.catalog.lookup(PDFName.of("Outlines"));
  let item = root instanceof PDFDict ? root.lookup(PDFName.of("First")) : undefined;
  while (item instanceof PDFDict) {
    const dest = item.lookup(PDFName.of("Dest"), PDFArray);
    const page = doc.getPages().findIndex((candidate) => candidate.ref === dest.get(0));
    titles.push(`${(item.lookup(PDFName.of("Title")) as PDFString).decodeText()}→${page}`);
    item = item.lookup(PDFName.of("Next"));
  }
  return titles;
}

describe("removed pages leave nothing behind", () => {
  it("drops a deleted page's content from the saved file", async () => {
    const bytes = await (await markedPdf(["KEEP-ONE", "SECRET-TWO", "KEEP-THREE"])).save({ useObjectStreams: false });
    expect(latin1(bytes)).toContain("SECRET-TWO");
    const saved = await applyPageEdit(bytes, { kind: "delete", pages: [1] });
    expect(latin1(saved)).not.toContain("SECRET-TWO");
    expect(latin1(saved)).toContain("KEEP-THREE");
    expect(pageObjectCount(await PDFDocument.load(saved))).toBe(2);
  });

  it("drops a deleted page's form fields and links pointing at it, keeping the rest", async () => {
    const doc = await markedPdf(["ONE", "TWO", "THREE"]);
    const form = doc.getForm();
    form.createTextField("on.one").addToPage(doc.getPage(0), { x: 10, y: 10 });
    form.createTextField("on.two").addToPage(doc.getPage(1), { x: 10, y: 10 });
    const shared = form.createTextField("shared");
    shared.addToPage(doc.getPage(0), { x: 10, y: 100 });
    shared.addToPage(doc.getPage(1), { x: 10, y: 100 });
    link(doc, 2, 1);
    const saved = await PDFDocument.load(await applyPageEdit(await doc.save(), { kind: "delete", pages: [1] }));
    expect(saved.getForm().getFields().map((field) => field.getName()).sort()).toEqual(["on.one", "shared"]);
    expect(saved.getPage(1).node.lookup(PDFName.of("Annots"), PDFArray).size()).toBe(0);
    expect(pageObjectCount(saved)).toBe(2);
  });

  it("removes bookmarks to deleted pages and keeps the others pointing at the right page", async () => {
    const doc = await markedPdf(["ONE", "TWO", "THREE"]);
    outline(doc, [0, 1, 2]);
    expect(await outlineTitles(await applyPageEdit(await doc.save(), { kind: "delete", pages: [1] }))).toEqual(["Go 0→0", "Go 2→1"]);
    expect(await outlineTitles(await applyPageEdit(await doc.save(), { kind: "move", pages: [2], to: 0 }))).toEqual(["Go 0→1", "Go 1→2", "Go 2→0"]);
  });

  it("extracts only the chosen pages even when links and fields reach other pages", async () => {
    const doc = await markedPdf(["ONE", "TWO", "THREE", "SECRET-FOUR"]);
    link(doc, 0, 3);
    const shared = doc.getForm().createTextField("shared");
    shared.addToPage(doc.getPage(0), { x: 10, y: 100 });
    shared.addToPage(doc.getPage(1), { x: 10, y: 100 });
    const extracted = await extractPages(await doc.save({ useObjectStreams: false }), [0]);
    expect(latin1(extracted)).not.toContain("SECRET-FOUR");
    const loaded = await PDFDocument.load(extracted);
    expect(pageObjectCount(loaded)).toBe(1);
    expect(loaded.getForm().getFields().map((field) => field.getName())).toEqual(["shared"]);
  });
});

describe("inserting pages", () => {
  it("doesn't let inserted pages inherit rotation from the page tree they land in", async () => {
    const doc = await PDFDocument.create();
    const pages = [100, 200, 300].map((width) => doc.addPage([width, 800]));
    const rootRef = doc.catalog.get(PDFName.of("Pages"))!;
    const branchRef = doc.context.register(doc.context.obj({ Type: "Pages", Parent: rootRef, Kids: [pages[1].ref, pages[2].ref], Count: 2, Rotate: 90 }));
    for (const page of pages.slice(1)) {
      page.node.set(PDFName.of("Parent"), branchRef);
    }
    doc.catalog.Pages().set(PDFName.of("Kids"), doc.context.obj([pages[0].ref, branchRef]));
    doc.catalog.Pages().set(PDFName.of("Count"), PDFNumber.of(3));
    const nested = await doc.save();
    expect(await describePdf(nested)).toEqual(["100", "200@90", "300@90"]);
    const inserted = await applyPageEdit(nested, { kind: "insert", data: await makePdf([500]), at: 2 });
    expect(await describePdf(inserted)).toEqual(["100", "200@90", "500", "300@90"]);
  });

  it("points links inside inserted pages at the inserted copies", async () => {
    const source = await markedPdf(["SRC-ONE", "SRC-TWO"]);
    link(source, 0, 1);
    const target = await makePdf([100]);
    const merged = await PDFDocument.load(await applyPageEdit(target, { kind: "insert", data: await source.save(), at: 1 }));
    const annotation = merged.getPage(1).node.lookup(PDFName.of("Annots"), PDFArray).lookup(0, PDFDict);
    expect(annotation.lookup(PDFName.of("Dest"), PDFArray).get(0)).toBe(merged.getPage(2).ref);
    expect(pageObjectCount(merged)).toBe(3);
  });
});

describe("changesDocument", () => {
  it("spots edits that wouldn't change anything", () => {
    expect(changesDocument({ kind: "move", pages: [2], to: 2 }, 4)).toBe(false);
    expect(changesDocument({ kind: "move", pages: [2], to: 3 }, 4)).toBe(false);
    expect(changesDocument({ kind: "move", pages: [2], to: 0 }, 4)).toBe(true);
    expect(changesDocument({ kind: "delete", pages: [9] }, 4)).toBe(false);
    expect(changesDocument({ kind: "rotate", pages: [0], by: 90 }, 4)).toBe(true);
  });
});

describe("extractPages and combinePdfs", () => {
  it("extracts selected pages into a new PDF", async () => {
    const bytes = await makePdf([100, 200, 300]);
    expect(await describePdf(await extractPages(bytes, [2, 0]))).toEqual(["100", "300"]);
  });

  it("keeps the first file's form fields working when combining", async () => {
    const first = await PDFDocument.create();
    first.addPage([100, 800]);
    first.getForm().createTextField("name").addToPage(first.getPage(0), { x: 10, y: 10 });
    const combined = await PDFDocument.load(await combinePdfs([await first.save(), await makePdf([200])]));
    expect(combined.getForm().getFields().map((field) => field.getName())).toEqual(["name"]);
    expect(await describePdf(await combined.save())).toEqual(["100", "200"]);
  });

  it("combines PDFs in order", async () => {
    const first = await makePdf([100]);
    const second = await makePdf([200, 300]);
    expect(await describePdf(await combinePdfs([first, second]))).toEqual(["100", "200", "300"]);
  });
});
