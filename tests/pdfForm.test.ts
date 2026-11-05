import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from "@cantoo/pdf-lib";
import { applyPageEdit } from "../src/lib/pageEdits";
import { PageEditError, changesDocument, countAfterEdit, pageAfterEdit, selectionAfterEdit } from "../src/lib/pageEditPlan";
import { appearanceTransform } from "../src/lib/pdfForm";

const key = PDFName.of;

async function formPdf(build: (doc: PDFDocument) => void) {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  doc.addPage([600, 800]);
  build(doc);
  return doc.save();
}

function annotationSubtypes(doc: PDFDocument) {
  return doc.getPages().map((page) => {
    const annots = page.node.lookup(key("Annots"));
    return annots instanceof PDFArray ? annots.asArray().map((ref) => String(doc.context.lookup(ref, PDFDict).get(key("Subtype")))) : [];
  });
}

function pageContent(doc: PDFDocument, index: number) {
  const contents = doc.getPages()[index].node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return refs
    .map((ref) => doc.context.lookup(ref))
    .map((stream) => (stream instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(stream).decode()) : ""))
    .join("\n");
}

function drawnText(doc: PDFDocument, operator: string) {
  return doc.context
    .enumerateIndirectObjects()
    .some(([, object]) => object instanceof PDFRawStream && new TextDecoder().decode(decodePDFRawStream(object).decode()).includes(operator));
}

describe("appearanceTransform", () => {
  it("maps the appearance box onto the widget rectangle", () => {
    expect(appearanceTransform([100, 200, 300, 220], [0, 0, 200, 20])).toEqual([1, 0, 0, 1, 100, 200]);
    expect(appearanceTransform([100, 200, 300, 220], [0, 0, 100, 10])).toEqual([2, 0, 0, 2, 100, 200]);
    expect(appearanceTransform([10, 10, 30, 20], [5, 5, 25, 15])).toEqual([1, 0, 0, 1, 5, 5]);
  });

  it("accounts for a rotated appearance", () => {
    const transform = appearanceTransform([100, 100, 120, 200], [0, 0, 100, 20], [0, 1, -1, 0, 0, 0])!;
    const [a, b, c, d, e, f] = transform;
    const corner = (x: number, y: number) => [a * -y + c * x + e, b * -y + d * x + f];
    expect(corner(0, 0)).toEqual([120, 100]);
    expect(corner(100, 20)).toEqual([100, 200]);
  });

  it("refuses empty boxes", () => {
    expect(appearanceTransform([0, 0, 0, 10], [0, 0, 10, 10])).toBeNull();
    expect(appearanceTransform([0, 0, 10, 10], [0, 0, 10, 0])).toBeNull();
  });
});

describe("flatten form", () => {
  it("draws every field onto its page and removes the form", async () => {
    const bytes = await formPdf((doc) => {
      const form = doc.getForm();
      const name = form.createTextField("name");
      name.setText("Ann Example");
      name.addToPage(doc.getPage(0), { x: 50, y: 700, width: 200, height: 20 });
      const agree = form.createCheckBox("agree");
      agree.addToPage(doc.getPage(1), { x: 50, y: 600, width: 12, height: 12 });
      agree.check();
    });
    const flattened = await PDFDocument.load(await applyPageEdit(bytes, { kind: "flatten" }));
    expect(flattened.catalog.has(key("AcroForm"))).toBe(false);
    expect(annotationSubtypes(flattened)).toEqual([[], []]);
    expect(pageContent(flattened, 0)).toMatch(/1 0 0 1 49\.5 699\.5 cm\s+\/FlatWidget-\d+ Do/);
    expect(pageContent(flattened, 1)).toMatch(/\/FlatWidget-\d+ Do/);
  });

  it("keeps other annotations and leaves no widget objects behind", async () => {
    const bytes = await formPdf((doc) => {
      const field = doc.getForm().createTextField("note");
      field.setText("x");
      field.addToPage(doc.getPage(0), { x: 10, y: 10, width: 50, height: 20 });
      const link = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 5, 5] }));
      doc.getPage(0).node.addAnnot(link);
    });
    const flattened = await PDFDocument.load(await applyPageEdit(bytes, { kind: "flatten" }));
    expect(annotationSubtypes(flattened)).toEqual([["/Link"], []]);
    const widgets = flattened.context
      .enumerateIndirectObjects()
      .filter(([, object]) => object instanceof PDFDict && object.get(key("Subtype")) === key("Widget"));
    expect(widgets).toHaveLength(0);
  });

  it("draws a value that has no appearance yet", async () => {
    const bytes = await formPdf((doc) => {
      const field = doc.getForm().createTextField("city");
      field.setText("Austin");
      field.addToPage(doc.getPage(0), { x: 20, y: 20, width: 100, height: 20 });
      field.acroField.getWidgets()[0].dict.delete(key("AP"));
      doc.getForm().acroForm.dict.set(key("NeedAppearances"), doc.context.obj(true));
    });
    const flattened = await PDFDocument.load(await applyPageEdit(bytes, { kind: "flatten" }));
    expect(flattened.catalog.has(key("AcroForm"))).toBe(false);
    expect(pageContent(flattened, 0)).toMatch(/\/FlatWidget-\d+ Do/);
    expect(drawnText(flattened, "<41757374696E> Tj")).toBe(true);
  });

  it("redraws fields whose appearance is out of date when the form asks for it", async () => {
    const bytes = await formPdf((doc) => {
      const form = doc.getForm();
      const field = form.createTextField("city");
      field.setText("Old");
      field.addToPage(doc.getPage(0), { x: 20, y: 20, width: 100, height: 20 });
      field.acroField.dict.set(key("V"), PDFHexString.fromText("Austin"));
      form.acroForm.dict.set(key("NeedAppearances"), doc.context.obj(true));
    });
    const flattened = await PDFDocument.load(await applyPageEdit(bytes, { kind: "flatten" }));
    expect(drawnText(flattened, "<41757374696E> Tj")).toBe(true);
  });

  it("flattens a checkbox by its value when it has no state", async () => {
    const bytes = await formPdf((doc) => {
      const agree = doc.getForm().createCheckBox("agree");
      agree.addToPage(doc.getPage(0), { x: 50, y: 600, width: 12, height: 12 });
      agree.check();
      agree.acroField.getWidgets()[0].dict.delete(key("AS"));
    });
    const flattened = await PDFDocument.load(await applyPageEdit(bytes, { kind: "flatten" }));
    expect(flattened.catalog.has(key("AcroForm"))).toBe(false);
    expect(pageContent(flattened, 0)).toMatch(/\/FlatWidget-\d+ Do/);
  });

  it("removes empty signature fields that have nothing to draw", async () => {
    const bytes = await formPdf((doc) => {
      const signature = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Widget", FT: "Sig", T: PDFString.of("sign"), Rect: [20, 20, 200, 60], P: doc.getPage(0).ref }));
      doc.getPage(0).node.addAnnot(signature);
      const name = doc.getForm().createTextField("name");
      name.setText("x");
      name.addToPage(doc.getPage(0), { x: 20, y: 100, width: 100, height: 20 });
      doc.getForm().acroForm.addField(signature);
    });
    const flattened = await PDFDocument.load(await applyPageEdit(bytes, { kind: "flatten" }));
    expect(flattened.catalog.has(key("AcroForm"))).toBe(false);
    expect(annotationSubtypes(flattened)).toEqual([[], []]);
  });

  it("drops hidden fields without drawing them", async () => {
    const bytes = await formPdf((doc) => {
      const field = doc.getForm().createTextField("secret");
      field.setText("hidden");
      field.addToPage(doc.getPage(0), { x: 20, y: 20, width: 100, height: 20 });
      field.acroField.getWidgets()[0].dict.set(key("F"), PDFNumber.of(2));
    });
    const flattened = await PDFDocument.load(await applyPageEdit(bytes, { kind: "flatten" }));
    expect(annotationSubtypes(flattened)).toEqual([[], []]);
    expect(pageContent(flattened, 0)).not.toMatch(/Do/);
  });

  it("removes flattened fields from the structure tree", async () => {
    const bytes = await formPdf((doc) => {
      const field = doc.getForm().createTextField("tagged");
      field.setText("x");
      field.addToPage(doc.getPage(0), { x: 20, y: 20, width: 100, height: 20 });
      const widget = doc.context.getObjectRef(field.acroField.getWidgets()[0].dict) as PDFRef;
      const objr = doc.context.obj({ Type: "OBJR", Obj: widget });
      const element = doc.context.register(doc.context.obj({ Type: "StructElem", S: "Form", Alt: "Tagged field", K: objr }));
      const paragraph = doc.context.register(doc.context.obj({ Type: "StructElem", S: "P", Pg: doc.getPage(0).ref, K: 0 }));
      doc.catalog.set(key("StructTreeRoot"), doc.context.register(doc.context.obj({ Type: "StructTreeRoot", K: [element, paragraph] })));
    });
    const flattened = await PDFDocument.load(await applyPageEdit(bytes, { kind: "flatten" }));
    const root = flattened.catalog.lookup(key("StructTreeRoot"), PDFDict);
    const kids = root.lookup(key("K"));
    const remaining = (kids instanceof PDFArray ? kids.asArray() : [kids]).map((ref) => String(flattened.context.lookup(ref!, PDFDict).get(key("S"))));
    expect(remaining).toEqual(["/P"]);
  });

  it("keeps the reader on the same page", () => {
    const edit = { kind: "flatten" } as const;
    expect(pageAfterEdit(edit, 3, 5)).toBe(3);
    expect(countAfterEdit(edit, 5)).toBe(5);
    expect(selectionAfterEdit(edit, 5)).toEqual([]);
    expect(changesDocument(edit, 5)).toBe(true);
  });

  it("refuses a document without fields", async () => {
    const bytes = await formPdf(() => {});
    await expect(applyPageEdit(bytes, { kind: "flatten" })).rejects.toThrow(PageEditError);
  });
});
