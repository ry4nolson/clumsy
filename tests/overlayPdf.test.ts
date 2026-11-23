import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, StandardFonts, decodePDFRawStream, degrees } from "@cantoo/pdf-lib";
import type { OverlayOptions, OverlaySheet } from "../src/lib/overlayPlan";
import { overlayPdfs } from "../src/lib/pageEdits";
import { PageEditError } from "../src/lib/pageEditPlan";
import { readPageLabels } from "../src/lib/pdfPageLabels";
import { openPdf } from "./pdfjsNode";

const key = PDFName.of;

async function drawings(sizes: Array<[number, number]>, change?: (doc: PDFDocument) => void) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  sizes.forEach(([width, height], index) => {
    const page = doc.addPage([width, height]);
    page.drawLine({ start: { x: 10, y: 10 }, end: { x: width - 10, y: height - 10 }, thickness: 2 });
    page.drawText(`Sheet ${index + 1}`, { x: 20, y: 20, size: 12, font });
  });
  change?.(doc);
  return doc.save();
}

const options = (sheets: OverlaySheet[]): OverlayOptions => ({ sheets, previous: [1, 0, 0], current: [0, 0.2, 1], previousName: "rev 3.pdf", currentName: "rev 4.pdf" });

const text = (doc: PDFDocument, stream: unknown) => new TextDecoder().decode(decodePDFRawStream(doc.context.lookup(stream as PDFRef, PDFRawStream)).decode());

function pageParts(doc: PDFDocument, index: number) {
  const page = doc.getPage(index).node;
  const resources = page.lookup(key("Resources"), PDFDict);
  const xObjects = resources.lookup(key("XObject"), PDFDict);
  return { page, resources, xObjects, content: text(doc, page.get(key("Contents"))) };
}

describe("overlay PDFs", () => {
  it("draws both sheets as tinted groups multiplied together, each in its own layer", async () => {
    const before = await drawings([[792, 612]]);
    const after = await drawings([[792, 612]]);
    const doc = await PDFDocument.load(await overlayPdfs(before, after, options([{ previous: 0, current: 0, label: "A-201 (overlay)" }])));
    expect(doc.getPageCount()).toBe(1);
    const { page, resources, xObjects, content } = pageParts(doc, 0);
    expect(page.lookup(key("MediaBox"), PDFArray).asArray().map(String)).toEqual(["0", "0", "792", "612"]);
    expect(content).toContain("/OC /Previous BDC q /Multiply gs /Previous Do Q EMC");
    expect(content).toContain("/OC /Current BDC q /Multiply gs /Current Do Q EMC");
    expect(String(resources.lookup(key("ExtGState"), PDFDict).lookup(key("Multiply"), PDFDict).get(key("BM")))).toBe("/Multiply");
    for (const [name, color] of [
      ["Previous", "1 0 0 rg"],
      ["Current", "0 0.2 1 rg"],
    ]) {
      const layer = xObjects.lookup(key(name), PDFRawStream);
      const group = layer.dict.lookup(key("Group"), PDFDict);
      expect(String(group.get(key("S")))).toBe("/Transparency");
      expect(String(group.get(key("I")))).toBe("true");
      const states = layer.dict.lookup(key("Resources"), PDFDict).lookup(key("ExtGState"), PDFDict);
      expect(String(states.lookup(key("Gray"), PDFDict).get(key("BM")))).toBe("/Saturation");
      expect(String(states.lookup(key("Tint"), PDFDict).get(key("BM")))).toBe("/Lighten");
      const drawn = text(doc, xObjects.get(key(name)));
      expect(drawn).toContain("/Page Do");
      expect(drawn.indexOf("/Gray gs")).toBeLessThan(drawn.indexOf(`/Tint gs ${color}`));
    }
    const properties = resources.lookup(key("Properties"), PDFDict);
    const layers = doc.catalog.lookup(key("OCProperties"), PDFDict).lookup(key("OCGs"), PDFArray).asArray();
    expect(layers).toEqual([properties.get(key("Previous")), properties.get(key("Current"))]);
    expect(readPageLabels(doc)).toEqual(["A-201 (overlay)"]);
  });

  it("opens in pdf.js with its layers and labels", async () => {
    const bytes = await overlayPdfs(await drawings([[400, 300]]), await drawings([[400, 300]]), options([{ previous: 0, current: 0, label: "S-1 (overlay)" }]));
    const pdf = await openPdf(bytes);
    expect(pdf.numPages).toBe(1);
    expect(await pdf.getPageLabels()).toEqual(["S-1 (overlay)"]);
    const config = await pdf.getOptionalContentConfig();
    expect([...config].map(([, group]) => group.name)).toEqual(["Previous: rev 3", "Current: rev 4"]);
    const operators = await (await pdf.getPage(1)).getOperatorList();
    expect(operators.fnArray.length).toBeGreaterThan(0);
    await pdf.loadingTask.destroy();
  });

  it("puts unpaired sheets at the end with one layer each", async () => {
    const before = await drawings([[400, 300], [400, 300]]);
    const after = await drawings([[400, 300], [500, 300]]);
    const doc = await PDFDocument.load(
      await overlayPdfs(
        before,
        after,
        options([
          { previous: 0, current: 0, label: "1 (overlay)" },
          { previous: 1, current: null, label: "2 (removed)" },
          { previous: null, current: 1, label: "2 (added)" },
        ]),
      ),
    );
    expect(doc.getPageCount()).toBe(3);
    expect(pageParts(doc, 1).xObjects.keys().map(String)).toEqual(["/Previous"]);
    expect(pageParts(doc, 2).xObjects.keys().map(String)).toEqual(["/Current"]);
    expect(doc.getPage(2).getWidth()).toBe(500);
    expect(readPageLabels(doc)).toEqual(["1 (overlay)", "2 (removed)", "2 (added)"]);
  });

  it("takes the current sheet's size and centers the previous one on it", async () => {
    const doc = await PDFDocument.load(await overlayPdfs(await drawings([[400, 300]]), await drawings([[500, 400]]), options([{ previous: 0, current: 0, label: "1" }])));
    expect([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]).toEqual([500, 400]);
    expect(text(doc, pageParts(doc, 0).xObjects.get(key("Previous")))).toContain("q 1 0 0 1 50 50 cm /Page Do Q");
  });

  it("places the previous sheet through an alignment", async () => {
    const sheet = { previous: 0, current: 0, label: "1", alignment: [0.5, 0, 0, 0.5, 12, -8] as [number, number, number, number, number, number] };
    const doc = await PDFDocument.load(await overlayPdfs(await drawings([[400, 300]]), await drawings([[400, 300]]), options([sheet])));
    expect(text(doc, pageParts(doc, 0).xObjects.get(key("Previous")))).toContain("q 0.5 0 0 0.5 12 -8 cm /Page Do Q");
  });

  it("shows rotated and cropped pages the way they're displayed", async () => {
    const turned = await drawings([[400, 300]], (doc) => {
      doc.getPage(0).setRotation(degrees(90));
      doc.getPage(0).setCropBox(50, 20, 300, 200);
    });
    const doc = await PDFDocument.load(await overlayPdfs(await drawings([[200, 300]]), turned, options([{ previous: 0, current: 0, label: "1" }])));
    expect([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]).toEqual([200, 300]);
    expect(doc.getPage(0).getRotation().angle).toBe(0);
    const layer = pageParts(doc, 0).xObjects.lookup(key("Current"), PDFRawStream);
    expect(text(doc, pageParts(doc, 0).xObjects.get(key("Current")))).toContain("q 0 -1 1 0 -20 350 cm /Page Do Q");
    const form = layer.dict.lookup(key("Resources"), PDFDict).lookup(key("XObject"), PDFDict).lookup(key("Page"), PDFRawStream);
    expect(form.dict.lookup(key("BBox"), PDFArray).asArray().map(String)).toEqual(["50", "20", "350", "220"]);
  });

  it("copies a font the sheets share once", async () => {
    const sizes: Array<[number, number]> = [[400, 300], [400, 300], [400, 300]];
    const sheets = sizes.map((_, index) => ({ previous: index, current: index, label: String(index + 1) }));
    const doc = await PDFDocument.load(await overlayPdfs(await drawings(sizes), await drawings(sizes), options(sheets)));
    const fonts = doc.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFDict && String(object.get(key("Type"))) === "/Font");
    expect(fonts).toHaveLength(2);
  });

  it("bakes markup into the sheets and adds change clouds as markup", async () => {
    const marked = await drawings([[400, 300]], (doc) => {
      const appearance = doc.context.register(doc.context.stream("1 0 0 RG 2 2 96 46 re S", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 100, 50] }));
      doc.getPage(0).node.set(key("Annots"), doc.context.obj([doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Square", Rect: [100, 100, 200, 150], F: 4, AP: { N: appearance } }))]));
    });
    const sheet = { previous: 0, current: 0, label: "1", changes: [{ left: 40, bottom: 60, right: 120, top: 140 }] };
    const doc = await PDFDocument.load(await overlayPdfs(await drawings([[400, 300]]), marked, options([sheet])));
    const page = pageParts(doc, 0);
    const form = page.xObjects.lookup(key("Current"), PDFRawStream).dict.lookup(key("Resources"), PDFDict).lookup(key("XObject"), PDFDict).lookup(key("Page"), PDFRawStream);
    expect(new TextDecoder().decode(decodePDFRawStream(form).decode())).toMatch(/Do/);
    const annots = page.page.lookup(key("Annots"), PDFArray);
    expect(annots.size()).toBe(1);
    const cloud = annots.lookup(0, PDFDict);
    expect(String(cloud.get(key("Subtype")))).toBe("/Square");
    expect(cloud.lookup(key("Subj")).toString()).toContain("4F007600650072006C006100790020006300680061006E00670065");
  });

  it("opens a protected tab's bytes with its password and refuses a locked file without one", async () => {
    const locked = await PDFDocument.create();
    locked.addPage([400, 300]);
    locked.encrypt({ userPassword: "secret", ownerPassword: "owner" });
    const bytes = await locked.save();
    const plain = await drawings([[400, 300]]);
    const sheets = options([{ previous: 0, current: 0, label: "1" }]);
    await expect(overlayPdfs(plain, bytes, sheets)).rejects.toBeInstanceOf(PageEditError);
    const doc = await PDFDocument.load(await overlayPdfs(plain, bytes, sheets, { current: "secret" }));
    expect(doc.isEncrypted).toBe(false);
    expect(doc.getPageCount()).toBe(1);
  });

  it("survives a page tree that lists itself and a page with no content", async () => {
    const hostile = await PDFDocument.create();
    hostile.addPage([400, 300]);
    const root = hostile.catalog.get(key("Pages")) as PDFRef;
    hostile.catalog.Pages().lookup(key("Kids"), PDFArray).push(root);
    const doc = await PDFDocument.load(await overlayPdfs(await hostile.save(), await drawings([[400, 300]]), options([{ previous: 0, current: 0, label: "1" }])));
    expect(doc.getPageCount()).toBe(1);
  });

  it("keeps a source's hidden layers hidden, nested under its side", async () => {
    const layered = await drawings([[400, 300]], (doc) => {
      const group = (name: string) => doc.context.register(doc.context.obj({ Type: "OCG", Name: PDFHexString.fromText(name) }));
      const [walls, notes] = [group("Walls"), group("Notes")];
      doc.catalog.set(key("OCProperties"), doc.context.obj({ OCGs: [walls, notes], D: { Order: [walls, notes], OFF: [notes] } }));
      const page = doc.getPage(0).node;
      page.lookup(key("Resources"), PDFDict).set(key("Properties"), doc.context.obj({ L0: notes }));
      const hidden = doc.context.register(doc.context.stream("/OC /L0 BDC 0 0 1 rg 50 50 100 100 re f EMC"));
      const contents = page.get(key("Contents"));
      page.set(key("Contents"), doc.context.obj([...(contents instanceof PDFArray ? contents.asArray() : [contents]), hidden]));
    });
    const bytes = await overlayPdfs(await drawings([[400, 300]]), layered, options([{ previous: 0, current: 0, label: "1" }]));
    const pdf = await openPdf(bytes);
    const config = await pdf.getOptionalContentConfig();
    const groups = [...config].map(([, group]) => [group.name, group.visible]);
    expect(groups).toEqual([
      ["Previous: rev 3", true],
      ["Current: rev 4", true],
      ["Walls", true],
      ["Notes", false],
    ]);
    const order = config.getOrder() as unknown[];
    expect(order).toHaveLength(3);
    expect(Array.isArray(order[2]) ? order[2] : (order[2] as { order: unknown[] }).order).toHaveLength(2);
    await pdf.loadingTask.destroy();
  });

  it("treats a base state of off as hidden unless a layer is listed on", async () => {
    const layered = await drawings([[400, 300]], (doc) => {
      const group = (name: string) => doc.context.register(doc.context.obj({ Type: "OCG", Name: PDFHexString.fromText(name) }));
      const [shown, hidden] = [group("Shown"), group("Hidden")];
      doc.catalog.set(key("OCProperties"), doc.context.obj({ OCGs: [shown, hidden], D: { BaseState: "OFF", ON: [shown] } }));
    });
    const doc = await PDFDocument.load(await overlayPdfs(layered, await drawings([[400, 300]]), options([{ previous: 0, current: 0, label: "1" }])));
    const properties = doc.catalog.lookup(key("OCProperties"), PDFDict);
    expect(properties.lookup(key("OCGs"), PDFArray).size()).toBe(4);
    const off = properties.lookup(key("D"), PDFDict).lookup(key("OFF"), PDFArray);
    expect(off.size()).toBe(1);
    expect((doc.context.lookup(off.get(0), PDFDict).lookup(key("Name")) as PDFHexString).decodeText()).toBe("Hidden");
  });

  it("keeps a sheet's user unit and converts points and clouds from displayed units", async () => {
    const big = await drawings([[400, 300]], (doc) => doc.getPage(0).node.set(key("UserUnit"), PDFNumber.of(2)));
    const sheet = { previous: 0, current: 0, label: "1", alignment: [1, 0, 0, 1, 40, 20] as [number, number, number, number, number, number], changes: [{ left: 100, bottom: 200, right: 300, top: 400 }] };
    const doc = await PDFDocument.load(await overlayPdfs(await drawings([[400, 300]]), big, options([sheet])));
    const page = pageParts(doc, 0);
    expect(String(page.page.get(key("UserUnit")))).toBe("2");
    expect([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]).toEqual([400, 300]);
    expect(text(doc, page.xObjects.get(key("Previous")))).toContain("q 0.5 0 0 0.5 20 10 cm /Page Do Q");
    const rect = page.page.lookup(key("Annots"), PDFArray).lookup(0, PDFDict).lookup(key("Rect"), PDFArray).asArray().map((value) => Number(String(value)));
    expect(rect[0]).toBeLessThanOrEqual(50);
    expect(rect[2]).toBeGreaterThanOrEqual(150);
    expect(rect[2]).toBeLessThan(170);
    expect(rect[3]).toBeLessThan(220);
  });

  it("refuses to build nothing", async () => {
    const plain = await drawings([[400, 300]]);
    await expect(overlayPdfs(plain, plain.slice(), options([{ previous: 7, current: null, label: "x" }]))).rejects.toThrow(/no pages to overlay/);
  });

  it("reports progress per sheet", async () => {
    const sizes: Array<[number, number]> = [[400, 300], [400, 300]];
    const seen: number[] = [];
    await overlayPdfs(await drawings(sizes), await drawings(sizes), options(sizes.map((_, index) => ({ previous: index, current: index, label: String(index + 1) }))), {}, ({ done }) => seen.push(done));
    expect(seen).toEqual([0, 1, 2]);
  });
});
