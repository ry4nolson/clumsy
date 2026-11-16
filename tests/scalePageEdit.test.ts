import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFString } from "@cantoo/pdf-lib";
import { defaultFormat, fullSize, sameScale, scalePresets, type MeasureFormat } from "../src/lib/measure";
import { VIEWPORT_NAME, pageScaleOf } from "../src/lib/measurePdf";
import { applyPageEdit, runPageEditJob } from "../src/lib/pageEdits";
import { pageAfterEdit, selectionAfterEdit, type PageEdit } from "../src/lib/pageEditPlan";
import { rewriteAction } from "../src/lib/signatureBytes";

const quarter = scalePresets.find((scale) => scale.label === `1/4" = 1'-0"`)!;
const metric: MeasureFormat = { unit: "mm", precision: 0 };
const name = (value: string) => PDFName.of(value);

async function makePdf(count: number, extra?: (doc: PDFDocument) => void) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < count; index++) {
    doc.addPage([612, 792]);
  }
  extra?.(doc);
  return doc.save();
}

const scalesOf = async (bytes: Uint8Array) => (await runPageEditJob({ op: "readScales", bytes })).scales!;

const scaleEdit = (pages: number[], scale = quarter as typeof quarter | null, format = defaultFormat): PageEdit => ({ kind: "scale", pages, scale, format });

describe("the scale page edit", () => {
  it("writes the scale on the chosen pages only", async () => {
    const scales = await scalesOf(await applyPageEdit(await makePdf(3), scaleEdit([0, 2], quarter, metric)));
    expect(scales[1]).toBeNull();
    for (const page of [scales[0], scales[2]]) {
      expect(sameScale(page!.scale, quarter)).toBe(true);
      expect(page!.scale.label).toBe(quarter.label);
      expect(page!.format).toEqual(metric);
    }
  });

  it("replaces a scale and removes it again", async () => {
    const scaled = await applyPageEdit(await makePdf(1), scaleEdit([0]));
    const replaced = await scalesOf(await applyPageEdit(scaled, scaleEdit([0], fullSize)));
    expect(sameScale(replaced[0]!.scale, fullSize)).toBe(true);
    const removed = await applyPageEdit(scaled, scaleEdit([0], null));
    expect(await scalesOf(removed)).toEqual([null]);
    expect((await PDFDocument.load(removed)).getPage(0).node.has(name("VP"))).toBe(false);
  });

  it("ignores pages out of range", async () => {
    expect((await scalesOf(await applyPageEdit(await makePdf(2), scaleEdit([5, -1])))).every((scale) => scale === null)).toBe(true);
  });

  it("keeps the page and the selection where they were", () => {
    const edit = scaleEdit([3, 1, 3]);
    expect(pageAfterEdit(edit, 2, 5)).toBe(2);
    expect(selectionAfterEdit(edit, 5)).toEqual([1, 3]);
    expect(rewriteAction(edit, false)).toBe("Setting the scale");
    expect(rewriteAction(scaleEdit([0], null), false)).toBe("Removing the scale");
  });
});

describe("reading a page's scale", () => {
  const viewport = (doc: PDFDocument, box: number[], unit: string, factor: number, label: string, viewportName?: string) => {
    const format = (factor: number) => [doc.context.obj({ U: PDFString.of(unit), C: PDFNumber.of(factor) })];
    const measure = doc.context.obj({ Type: "Measure", Subtype: "RL", X: format(factor), D: format(1), A: format(1) });
    measure.set(name("R"), PDFString.of(label));
    const dict = doc.context.obj({ Type: "Viewport", BBox: box, Measure: measure });
    if (viewportName) {
      dict.set(name("Name"), PDFString.of(viewportName));
    }
    return dict;
  };

  it("prefers Clumsy's viewport, then the one over the page's center, and skips blank CAD viewports", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    page.node.set(name("VP"), doc.context.obj([viewport(doc, [36, 36, 576, 756], " ", 0.35278, " ")]));
    expect(pageScaleOf(page.node)).toBeNull();

    page.node.set(name("VP"), doc.context.obj([viewport(doc, [0, 0, 300, 300], "ft", 1, "corner"), viewport(doc, [0, 0, 612, 792], "ft", 0.5, "center")]));
    expect(pageScaleOf(page.node)!.scale.label).toBe("center");

    const vp = page.node.lookup(name("VP"), PDFArray);
    vp.insert(0, viewport(doc, [0, 0, 10, 10], "ft", 2, "mine", VIEWPORT_NAME));
    expect(pageScaleOf(page.node)!.scale.label).toBe("mine");
  });
});
