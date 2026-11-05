import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from "@cantoo/pdf-lib";
import { applyPageEdit, extractPages, pageCount } from "../src/lib/pageEdits";
import { hasXrefAt, writeStickyNotes } from "../src/lib/notesPdf";
import { pageLeafRefs } from "../src/lib/pdfStructure";
import type { StickyNote } from "../src/lib/notes";

const key = PDFName.of;

async function makePdf(widths: number[], tamper: (doc: PDFDocument, root: PDFRef, pages: PDFRef[]) => void) {
  const doc = await PDFDocument.create();
  const pages = widths.map((width) => doc.addPage([width, 800]).ref);
  const root = doc.catalog.get(key("Pages")) as PDFRef;
  tamper(doc, root, pages);
  return doc.save({ addDefaultPage: false, useObjectStreams: false, updateFieldAppearances: false });
}

async function describePdf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => `${page.getWidth()}${page.getRotation().angle ? `@${page.getRotation().angle}` : ""}`);
}

const listsItself = (doc: PDFDocument, root: PDFRef) => doc.context.lookup(root, PDFDict).lookup(key("Kids"), PDFArray).push(root);

function parentLoop(doc: PDFDocument, root: PDFRef, pages: PDFRef[]) {
  const middle = doc.context.register(doc.context.obj({ Type: "Pages", Kids: [pages[0]], Count: 1, Parent: root, MediaBox: [0, 0, 150, 800] }));
  const first = doc.context.lookup(pages[0], PDFDict);
  first.set(key("Parent"), middle);
  first.delete(key("MediaBox"));
  const rootDict = doc.context.lookup(root, PDFDict);
  rootDict.lookup(key("Kids"), PDFArray).set(0, middle);
  rootDict.set(key("Parent"), middle);
}

function fieldLoop(doc: PDFDocument) {
  const form = doc.getForm();
  form.createTextField("parent").addToPage(doc.getPage(0), { x: 54, y: 700, width: 200, height: 20 });
  const parent = form.getTextField("parent").ref;
  const child = doc.context.register(doc.context.obj({ T: PDFString.of("child"), Parent: parent, Kids: [parent] }));
  doc.context.lookup(parent, PDFDict).lookup(key("Kids"), PDFArray).push(child);
}

const note: StickyNote = { id: "new-1", pageIndex: 0, rect: [50, 50, 74, 74], text: "Hi", color: null, date: null, fresh: true, deleted: false };

async function annotationCount(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.context.lookup(pageLeafRefs(doc)[0], PDFDict).lookupMaybe(key("Annots"), PDFArray)?.size() ?? 0;
}

describe("page trees that loop", () => {
  it("edits a page tree that lists itself as a kid", async () => {
    const bytes = await makePdf([100, 200, 300], listsItself);
    expect(await pageCount(bytes)).toBe(3);
    expect(await describePdf(await applyPageEdit(bytes, { kind: "rotate", pages: [0], by: 90 }))).toEqual(["100@90", "200", "300"]);
    expect(await describePdf(await applyPageEdit(bytes, { kind: "move", pages: [2], to: 0 }))).toEqual(["300", "100", "200"]);
    expect(await describePdf(await extractPages(bytes, [1]))).toEqual(["200"]);
  });

  it("edits a page tree whose parents loop, keeping inherited sizes", async () => {
    const bytes = await makePdf([100, 200, 300], parentLoop);
    expect(await describePdf(await applyPageEdit(bytes, { kind: "delete", pages: [1] }))).toEqual(["150", "300"]);
  });

  it("adds sticky notes to a page tree that lists itself", async () => {
    const bytes = await makePdf([100, 200], listsItself);
    expect(await annotationCount(await writeStickyNotes(bytes, [note]))).toBe(2);
  });
});

describe("form fields that loop", () => {
  it("flattens and extracts a form whose field is its own grandchild", async () => {
    const bytes = await makePdf([612], (doc) => fieldLoop(doc));
    const flattened = await PDFDocument.load(await applyPageEdit(bytes, { kind: "flatten" }));
    expect(flattened.catalog.lookup(key("AcroForm"))).toBeUndefined();
    expect(await describePdf(await extractPages(bytes, [0]))).toEqual(["612"]);
  });

  it("keeps a kid field under its parent when /Fields lists both", async () => {
    const bytes = await makePdf([612, 300], (doc) => {
      const field = doc.getForm().createTextField("parent.kid");
      field.addToPage(doc.getPage(0), { x: 54, y: 700, width: 200, height: 20 });
      doc.getForm().acroForm.dict.lookup(key("Fields"), PDFArray).push(field.ref);
    });
    const edited = await PDFDocument.load(await applyPageEdit(bytes, { kind: "delete", pages: [1] }));
    const fields = edited.getForm().acroForm.dict.lookup(key("Fields"), PDFArray).asArray();
    const parent = edited.context.lookup(fields[0], PDFDict);
    expect(parent.lookup(key("Kids"), PDFArray).asArray()).toContain(fields[1]);
    expect(edited.getForm().getTextField("parent.kid")).toBeTruthy();
  });
});

describe("sticky notes in files without a usable xref", () => {
  const withoutStartxref = (bytes: Uint8Array) => {
    const text = Buffer.from(bytes).toString("latin1");
    return new Uint8Array(Buffer.from(`${text.slice(0, text.lastIndexOf("startxref"))}%%EOF\n`, "latin1"));
  };
  const lastStartxref = (bytes: Uint8Array) => Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(Buffer.from(bytes).toString("latin1"))?.[1]);

  it("finds an xref only where one starts", async () => {
    const bytes = await makePdf([100], () => {});
    expect(hasXrefAt(bytes, lastStartxref(bytes))).toBe(true);
    expect(hasXrefAt(bytes, 0)).toBe(false);
    expect(hasXrefAt(bytes, bytes.length + 10)).toBe(false);
    expect(hasXrefAt(bytes, lastStartxref(bytes) + 3)).toBe(false);
  });

  it("rewrites the whole file instead of appending an update nothing can find", async () => {
    const broken = withoutStartxref(await makePdf([100, 200], () => {}));
    const saved = await writeStickyNotes(broken, [note]);
    expect(Buffer.from(saved.subarray(0, broken.length)).equals(Buffer.from(broken))).toBe(false);
    expect(hasXrefAt(saved, lastStartxref(saved))).toBe(true);
    expect(await annotationCount(saved)).toBe(2);
  });
});
