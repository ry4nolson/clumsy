import { describe, expect, it } from "vitest";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";
import { applyPageEdit, combinePdfs, extractPages } from "../src/lib/pageEdits";

async function everyText(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const found: string[] = [];
  const visit = (object: PDFObject | undefined) => {
    if (object instanceof PDFString || object instanceof PDFHexString) {
      found.push(object.decodeText());
    } else if (object instanceof PDFDict) {
      object.values().forEach(visit);
    } else if (object instanceof PDFArray) {
      object.asArray().forEach(visit);
    } else if (object instanceof PDFStream) {
      visit(object.dict);
      const raw = object instanceof PDFRawStream ? decodePDFRawStream(object).decode() : object.getContents();
      found.push(new TextDecoder("latin1").decode(raw));
    }
  };
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    visit(object);
  }
  return found.join("\n");
}
const name = PDFName.of;

async function markedPdf(labels: string[]) {
  const doc = await PDFDocument.create();
  for (const label of labels) {
    const page = doc.addPage([400, 800]);
    page.node.set(name("Contents"), doc.context.register(doc.context.stream(`BT /F1 12 Tf 10 10 Td (${label}) Tj ET`)));
  }
  return doc;
}

const plain = (doc: PDFDocument) => doc.save({ useObjectStreams: false });

function tagPages(doc: PDFDocument, alts: string[]) {
  const rootRef = doc.context.nextRef();
  const documentRef = doc.context.nextRef();
  const figures = alts.map((alt, index) =>
    doc.context.register(
      doc.context.obj({ Type: "StructElem", S: "Figure", P: documentRef, Pg: doc.getPage(index).ref, K: 0, Alt: PDFString.of(alt) }),
    ),
  );
  const spanning = doc.context.register(
    doc.context.obj({
      Type: "StructElem",
      S: "P",
      P: documentRef,
      K: alts.map((_, index) => doc.context.obj({ Type: "MCR", Pg: doc.getPage(index).ref, MCID: 1 })),
      ActualText: PDFString.of("SPANS-EVERY-PAGE"),
    }),
  );
  doc.context.assign(documentRef, doc.context.obj({ Type: "StructElem", S: "Document", P: rootRef, K: [...figures, spanning] }));
  const nums = alts.flatMap((_, index) => [PDFNumber.of(index), doc.context.obj([figures[index], spanning])]);
  doc.context.assign(
    rootRef,
    doc.context.obj({
      Type: "StructTreeRoot",
      K: documentRef,
      ParentTree: doc.context.obj({ Nums: nums }),
      IDTree: doc.context.obj({ Names: alts.flatMap((_, index) => [PDFString.of(`id${index}`), figures[index]]) }),
    }),
  );
  alts.forEach((_, index) => doc.getPage(index).node.set(name("StructParents"), PDFNumber.of(index)));
  doc.catalog.set(name("StructTreeRoot"), rootRef);
}

function calculatedField(doc: PDFDocument, page: number, fieldName: string, value: string) {
  const field = doc.getForm().createTextField(fieldName);
  field.setText(value);
  field.addToPage(doc.getPage(page), { x: 10, y: 10 });
  const form = doc.catalog.lookup(name("AcroForm"), PDFDict);
  const order = form.lookup(name("CO"));
  const entries = order instanceof PDFArray ? order.asArray() : [];
  form.set(name("CO"), doc.context.obj([...entries, field.ref]));
}

function namedOutline(doc: PDFDocument, titles: string[]) {
  const outlinesRef = doc.context.nextRef();
  const refs = titles.map(() => doc.context.nextRef());
  titles.forEach((title, index) => {
    doc.context.assign(
      refs[index],
      doc.context.obj({
        Title: PDFString.of(title),
        Parent: outlinesRef,
        A: doc.context.obj({ S: "GoTo", D: PDFString.of(`section.${index}`) }),
        ...(index > 0 ? { Prev: refs[index - 1] } : {}),
        ...(index < refs.length - 1 ? { Next: refs[index + 1] } : {}),
      }),
    );
  });
  doc.context.assign(outlinesRef, doc.context.obj({ Type: "Outlines", First: refs[0], Last: refs.at(-1)!, Count: refs.length }));
  doc.catalog.set(name("Outlines"), outlinesRef);
  const names = titles.flatMap((_, index) => [PDFHexString.fromText(`section.${index}`), doc.context.obj([doc.getPage(index).ref, name("Fit")])]);
  doc.catalog.set(name("Names"), doc.context.obj({ Dests: doc.context.obj({ Names: names }) }));
}

function outlineTitles(doc: PDFDocument) {
  const titles: string[] = [];
  const root = doc.catalog.lookup(name("Outlines"));
  let item = root instanceof PDFDict ? root.lookup(name("First")) : undefined;
  while (item instanceof PDFDict) {
    titles.push((item.lookup(name("Title")) as PDFString).decodeText());
    item = item.lookup(name("Next"));
  }
  return titles;
}

describe("removing pages scrubs everything that described them", () => {
  it("drops tagged-PDF alt text for deleted pages but keeps elements that span kept pages", async () => {
    const doc = await markedPdf(["ONE", "TWO", "THREE"]);
    tagPages(doc, ["ALT-ONE", "ALT-SECRET-PASSPORT", "ALT-THREE"]);
    const saved = await applyPageEdit(await plain(doc), { kind: "delete", pages: [1] });
    const text = await everyText(saved);
    expect(text).not.toContain("ALT-SECRET-PASSPORT");
    expect(text).toContain("ALT-ONE");
    expect(text).toContain("ALT-THREE");
    expect(text).toContain("SPANS-EVERY-PAGE");
    const root = (await PDFDocument.load(saved)).catalog.lookup(name("StructTreeRoot"), PDFDict);
    expect(root.lookup(name("IDTree"), PDFDict).lookup(name("Names"), PDFArray).size()).toBe(4);
  });

  it("drops a deleted page's field values even when the calculation order lists them", async () => {
    const doc = await markedPdf(["ONE", "TWO"]);
    calculatedField(doc, 0, "subtotal", "KEEP-VALUE");
    calculatedField(doc, 1, "ssn", "FIELD-SECRET-123-45-6789");
    const saved = await PDFDocument.load(await applyPageEdit(await plain(doc), { kind: "delete", pages: [1] }));
    expect(await everyText(await plain(saved))).not.toContain("FIELD-SECRET");
    expect(await everyText(await plain(saved))).toContain("KEEP-VALUE");
    const order = saved.catalog.lookup(name("AcroForm"), PDFDict).lookup(name("CO"), PDFArray);
    expect(order.asArray().map((ref) => saved.context.lookup(ref, PDFDict).lookup(name("T"), PDFString, PDFHexString).decodeText())).toEqual(["subtotal"]);
  });

  it("drops XFA form data, which keeps its own copy of every field value", async () => {
    const doc = await markedPdf(["ONE", "TWO"]);
    doc.getForm().createTextField("name").addToPage(doc.getPage(0), { x: 10, y: 10 });
    const xfa = doc.context.register(doc.context.stream("<xfa:datasets><ssn>XFA-SECRET</ssn></xfa:datasets>"));
    doc.catalog.lookup(name("AcroForm"), PDFDict).set(name("XFA"), xfa);
    const deleted = await applyPageEdit(await plain(doc), { kind: "delete", pages: [1] });
    expect(await everyText(await plain(doc))).toContain("XFA-SECRET");
    expect(await everyText(deleted)).not.toContain("XFA-SECRET");
    expect((await PDFDocument.load(deleted)).getForm().getFields().map((field) => field.getName())).toEqual(["name"]);
    expect(await everyText(await extractPages(await plain(doc), [0]))).not.toContain("XFA-SECRET");
  });

  it("keeps XFA when no pages are removed, since dynamic XFA forms have nothing else", async () => {
    const doc = await markedPdf(["ONE", "TWO"]);
    doc.catalog.set(name("AcroForm"), doc.context.obj({ Fields: [], XFA: doc.context.register(doc.context.stream("<xfa>XFA-KEEP</xfa>")) }));
    for (const edit of [{ kind: "rotate", pages: [0], by: 90 }, { kind: "move", pages: [1], to: 0 }] as const) {
      expect(await everyText(await applyPageEdit(await plain(doc), edit))).toContain("XFA-KEEP");
    }
  });

  it("removes bookmarks and links that reach deleted pages through named destinations", async () => {
    const doc = await markedPdf(["ONE", "TWO", "THREE"]);
    namedOutline(doc, ["Intro", "TITLE-SECRET", "End"]);
    const link = doc.context.register(
      doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 9, 9], Dest: PDFHexString.fromText("section.1") }),
    );
    doc.getPage(0).node.set(name("Annots"), doc.context.obj([link]));
    const saved = await applyPageEdit(await plain(doc), { kind: "delete", pages: [1] });
    expect(await everyText(saved)).not.toContain("TITLE-SECRET");
    expect(await everyText(saved)).toContain("Intro");
    const loaded = await PDFDocument.load(saved);
    expect(outlineTitles(loaded)).toEqual(["Intro", "End"]);
    expect(loaded.getPage(0).node.lookup(name("Annots"), PDFArray).size()).toBe(0);
  });

  it("keeps only the extracted pages' named bookmarks", async () => {
    const doc = await markedPdf(["ONE", "TWO", "THREE"]);
    namedOutline(doc, ["Intro", "Middle", "End"]);
    expect(outlineTitles(await PDFDocument.load(await extractPages(await plain(doc), [2])))).toEqual(["End"]);
  });

  it("resolves legacy /Dests names too", async () => {
    const doc = await markedPdf(["ONE", "TWO"]);
    doc.catalog.set(name("Dests"), doc.context.obj({ gone: [doc.getPage(1).ref, name("Fit")] }));
    const link = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 9, 9], Dest: name("gone") }));
    doc.getPage(0).node.set(name("Annots"), doc.context.obj([link]));
    const loaded = await PDFDocument.load(await applyPageEdit(await plain(doc), { kind: "delete", pages: [1] }));
    expect(loaded.getPage(0).node.lookup(name("Annots"), PDFArray).size()).toBe(0);
  });

  it("drops an open action that pointed at a deleted page", async () => {
    const doc = await markedPdf(["ONE", "TWO"]);
    doc.catalog.set(name("OpenAction"), doc.context.obj([doc.getPage(1).ref, name("Fit")]));
    const loaded = await PDFDocument.load(await applyPageEdit(await plain(doc), { kind: "delete", pages: [1] }));
    expect(loaded.catalog.get(name("OpenAction"))).toBeUndefined();
  });
});

describe("structure tree edge cases", () => {
  it("keeps an element whose annotation is on a kept page even if the element claims the removed page", async () => {
    const doc = await markedPdf(["ONE", "TWO"]);
    const annotation = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 9, 9], StructParent: 5 }));
    doc.getPage(0).node.set(name("Annots"), doc.context.obj([annotation]));
    const rootRef = doc.context.nextRef();
    const element = doc.context.register(
      doc.context.obj({ Type: "StructElem", S: "Link", P: rootRef, Pg: doc.getPage(1).ref, Alt: PDFString.of("ALT-KEPT-LINK"), K: doc.context.obj({ Type: "OBJR", Obj: annotation }) }),
    );
    doc.context.assign(rootRef, doc.context.obj({ Type: "StructTreeRoot", K: [element], ParentTree: doc.context.obj({ Nums: [PDFNumber.of(5), element] }) }));
    doc.catalog.set(name("StructTreeRoot"), rootRef);
    expect(await everyText(await applyPageEdit(await plain(doc), { kind: "delete", pages: [1] }))).toContain("ALT-KEPT-LINK");
  });

  it("removes an element shared by two parents from both instead of leaving a null", async () => {
    const doc = await markedPdf(["ONE", "TWO"]);
    const rootRef = doc.context.nextRef();
    const shared = doc.context.register(doc.context.obj({ Type: "StructElem", S: "Figure", Pg: doc.getPage(1).ref, K: 0, Alt: PDFString.of("ALT-SHARED") }));
    const kept = doc.context.register(doc.context.obj({ Type: "StructElem", S: "P", Pg: doc.getPage(0).ref, K: 0 }));
    const first = doc.context.register(doc.context.obj({ Type: "StructElem", S: "Div", P: rootRef, K: [shared, kept] }));
    const second = doc.context.register(doc.context.obj({ Type: "StructElem", S: "Div", P: rootRef, K: [shared, kept] }));
    doc.context.assign(rootRef, doc.context.obj({ Type: "StructTreeRoot", K: [first, second] }));
    doc.catalog.set(name("StructTreeRoot"), rootRef);
    const saved = await PDFDocument.load(await applyPageEdit(await plain(doc), { kind: "delete", pages: [1] }));
    const root = saved.catalog.lookup(name("StructTreeRoot"), PDFDict);
    for (const division of root.lookup(name("K"), PDFArray).asArray()) {
      const kids = saved.context.lookup(division, PDFDict).lookup(name("K"));
      const list = kids instanceof PDFArray ? kids.asArray() : [kids];
      expect(list.every((kid) => saved.context.lookup(kid) instanceof PDFDict)).toBe(true);
      expect(list).toHaveLength(1);
    }
    expect(await everyText(await plain(saved))).not.toContain("ALT-SHARED");
  });
});

describe("open actions", () => {
  it("keeps an open action that opens another file even if its name matches a removed page", async () => {
    const doc = await markedPdf(["ONE", "TWO"]);
    doc.catalog.set(name("Names"), doc.context.obj({ Dests: doc.context.obj({ Names: [PDFHexString.fromText("intro"), doc.context.obj([doc.getPage(1).ref, name("Fit")])] }) }));
    doc.catalog.set(name("OpenAction"), doc.context.obj({ S: "GoToR", F: PDFString.of("other.pdf"), D: PDFHexString.fromText("intro") }));
    const loaded = await PDFDocument.load(await applyPageEdit(await plain(doc), { kind: "delete", pages: [1] }));
    expect(loaded.catalog.lookup(name("OpenAction"), PDFDict).lookup(name("S"))).toBe(name("GoToR"));
  });
});

describe("inserted pages and tags", () => {
  it("strips struct parent numbers from copied pages so they don't collide", async () => {
    const target = await markedPdf(["ONE"]);
    tagPages(target, ["ALT-ONE"]);
    const source = await markedPdf(["TWO"]);
    tagPages(source, ["ALT-TWO"]);
    const combined = await PDFDocument.load(await combinePdfs([await plain(target), await plain(source)]));
    expect(combined.getPage(0).node.get(name("StructParents"))).toBeInstanceOf(PDFNumber);
    expect(combined.getPage(1).node.get(name("StructParents"))).toBeUndefined();
    expect(combined.getPage(1).ref).toBeInstanceOf(PDFRef);
  });
});
