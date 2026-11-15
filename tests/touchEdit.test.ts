import { describe, expect, it } from "vitest";
import { editorUnder } from "../src/lib/touchEdit";

const element = (id: string) => ({ id }) as Element;

describe("editorUnder", () => {
  const layer = { contains: (candidate: Element) => candidate.id !== "outside" && !candidate.id.startsWith("other") } as Element;

  it("finds a pdf.js editor in this page's layer", () => {
    expect(editorUnder(layer, [element("span"), element("pdfjs_internal_editor_12")])).toBe(true);
  });

  it("ignores other elements and editors on other pages", () => {
    expect(editorUnder(layer, [element("span"), element("pdfjs_internal_editor_x")])).toBe(false);
    expect(editorUnder({ contains: () => false } as unknown as Element, [element("pdfjs_internal_editor_3")])).toBe(false);
  });
});
