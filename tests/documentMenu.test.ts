import { describe, expect, it } from "vitest";
import { documentMenu, flattenMenu, pageSection, targetPages, type MenuContext, type MenuEntry, type MenuSection } from "../src/lib/documentMenu";

const base: MenuContext = {
  page: 4,
  pagesCount: 10,
  selectedPages: [],
  pageLabels: null,
  textSelected: false,
  link: null,
  activeTool: "select",
  mark: null,
  contextTools: null,
  canGoBack: false,
  canGoForward: false,
  canAddComment: true,
  canPrint: true,
  scaleValue: "page-width",
};

const labels = (items: MenuEntry[]) => items.map((entry) => (entry.kind === "separator" ? "-" : entry.label));
const menu = (overrides: Partial<MenuContext> = {}) => documentMenu({ ...base, ...overrides });
const ids = (sections: MenuSection[]) => sections.flatMap((section) => section.items.flatMap((entry) => (entry.kind === "item" ? [entry.id] : [entry.kind])));

describe("targetPages", () => {
  it("uses the selection when the clicked page is in it, otherwise just that page", () => {
    expect(targetPages(3, [5, 3, 4])).toEqual([3, 4, 5]);
    expect(targetPages(7, [3, 4])).toEqual([7]);
    expect(targetPages(2, [])).toEqual([2]);
  });
});

describe("pageSection", () => {
  it("keeps the thumbnail menu's items for one page", () => {
    const section = pageSection([4], 10, null, true);
    expect(section.header).toBe("Page 5");
    expect(labels(section.items)).toEqual([
      "Rotate Page Left",
      "Rotate Page Right",
      "-",
      "Extract Page to New Tab",
      "Export Page as Image…",
      "Print Page…",
      "Insert Pages from File…",
      "Page Labels…",
      "-",
      "Delete Page",
    ]);
  });

  it("pluralizes for several pages", () => {
    const section = pageSection([1, 2, 3], 10, null, true);
    expect(section.header).toBe("3 Pages");
    expect(labels(section.items)).toEqual([
      "Rotate 3 Pages Left",
      "Rotate 3 Pages Right",
      "-",
      "Extract 3 Pages to New Tab",
      "Export 3 Pages as Images…",
      "Print 3 Pages…",
      "Insert Pages from File…",
      "Page Labels…",
      "-",
      "Delete 3 Pages",
    ]);
  });

  it("uses the page label in the header", () => {
    expect(pageSection([0], 3, ["i", "ii", "1"], true).header).toBe("Page i");
  });

  it("disables Delete when it would remove every page and leaves out Print where printing isn't available", () => {
    const section = pageSection([0, 1], 2, null, false);
    expect(section.items.at(-1)).toMatchObject({ id: "deletePages", enabled: false });
    expect(ids([section])).not.toContain("printSelectedPages");
    expect(pageSection([0], 2, null, true).items.at(-1)).toMatchObject({ id: "deletePages", enabled: true });
  });
});

describe("documentMenu", () => {
  it("builds the default page menu: comment, navigation and zoom, then the page", () => {
    const { spec, pages } = menu();
    expect(pages).toEqual([4]);
    expect(spec.sections.map((section) => section.header ?? null)).toEqual([null, null, "Page 5"]);
    expect(ids(spec.sections.slice(0, 2))).toEqual(["addCommentHere", "goBack", "goForward", "submenu"]);
  });

  it("always has the Zoom submenu, with the current fit checked", () => {
    for (const context of [menu(), menu({ page: null }), menu({ scaleValue: "page-fit" })]) {
      const zoom = context.spec.sections.flatMap((section) => section.items).find((entry) => entry.kind === "submenu");
      expect(zoom && zoom.kind === "submenu" && labels(zoom.items)).toEqual(["Zoom In", "Zoom Out", "Actual Size", "Fit Width", "Fit Page"]);
    }
    const fit = menu({ scaleValue: "page-fit" }).spec.sections[1].items[2];
    expect(fit.kind === "submenu" && fit.items.filter((entry) => entry.kind === "item" && entry.checked).map((entry) => entry.kind === "item" && entry.id)).toEqual(["fitPage"]);
  });

  it("enables Go Back and Go Forward from the history", () => {
    const navigation = menu({ canGoBack: true }).spec.sections[1].items;
    expect(navigation[0]).toMatchObject({ id: "goBack", enabled: true });
    expect(navigation[1]).toMatchObject({ id: "goForward", enabled: false });
  });

  it("adds the text section only for a selection on a page", () => {
    expect(ids(menu({ textSelected: true }).spec.sections).slice(0, 6)).toEqual(["copy", "highlightSelection", "underlineSelection", "strikeoutSelection", "commentSelection", "useSelectionForFind"]);
    expect(ids(menu({ textSelected: true, page: null }).spec.sections)).not.toContain("copy");
    expect(ids(menu().spec.sections)).not.toContain("copy");
  });

  it("offers Open and Copy Link for web links and Go to Destination for internal ones", () => {
    const external = menu({ link: { kind: "external", href: "https://example.com" } }).spec.sections[0].items;
    expect(external).toEqual([
      { kind: "item", id: "openLink", label: "Open Link" },
      { kind: "copyText", label: "Copy Link", text: "https://example.com" },
    ]);
    expect(ids(menu({ link: { kind: "internal", href: "#page=2" } }).spec.sections)[0]).toBe("followLink");
    expect(ids(menu({ link: null }).spec.sections)).not.toContain("openLink");
  });

  it("drops the selection, comment, and page sections between pages", () => {
    const { spec, pages } = menu({ page: null, textSelected: true });
    expect(pages).toEqual([]);
    expect(ids(spec.sections)).toEqual(["goBack", "goForward", "submenu"]);
  });

  it("leaves out Add Comment Here when notes can't be written", () => {
    expect(ids(menu({ canAddComment: false }).spec.sections)).not.toContain("addCommentHere");
  });

  it("acts on the selection when the clicked page is in it", () => {
    const { spec, pages } = menu({ page: 3, selectedPages: [2, 3] });
    expect(pages).toEqual([2, 3]);
    expect(spec.sections.at(-1)?.header).toBe("2 Pages");
    expect(menu({ page: 6, selectedPages: [2, 3] }).pages).toEqual([6]);
  });

  it("shows the chosen tools in toolbar order with the active one checked", () => {
    const palette = menu({ activeTool: "draw", contextTools: ["signature", "draw", "lasso", "select"] }).spec.palette;
    expect(palette?.items.map((tool) => [tool.id, tool.checked])).toEqual([
      ["toolSelect", false],
      ["toolDraw", true],
      ["sign", false],
    ]);
    expect(palette?.items.every((tool) => tool.symbol.length > 0)).toBe(true);
    expect(menu({ contextTools: [] }).spec.palette).toBeNull();
    expect(menu().spec.palette?.items.map((tool) => tool.label)).toEqual(["Select", "Highlight", "Text Note", "Draw", "Comments", "Sign"]);
  });

  it("uses the remembered shape and text mode, and checks Highlight for underline and strikethrough", () => {
    const palette = menu({ contextTools: ["highlight", "shape"], activeTool: "strikeout", markupChoice: { shape: "arrow", textMode: "underline" } }).spec.palette;
    expect(palette?.items.map((tool) => [tool.id, tool.checked])).toEqual([
      ["toolUnderline", true],
      ["shapeArrow", false],
    ]);
  });

  it("places the last-used mark from Fill In", () => {
    const palette = menu({ contextTools: ["mark"], activeTool: "mark", mark: "cross" }).spec.palette;
    expect(palette?.items).toEqual([{ id: "markCross", label: "Fill In", symbol: "checkmark.square", checked: true }]);
  });
});

describe("flattenMenu", () => {
  it("turns the palette into items at the top and headers into entries, with separators between groups", () => {
    const flat = flattenMenu(menu({ contextTools: ["select", "hand"], page: 0, pagesCount: 1 }).spec);
    const kinds = flat.map((entry) => (entry.kind === "item" ? entry.id : entry.kind === "header" ? `# ${entry.label}` : entry.kind));
    expect(kinds.slice(0, 8)).toEqual(["toolSelect", "toolHand", "separator", "addCommentHere", "separator", "goBack", "goForward", "submenu"]);
    expect(kinds.slice(8, 11)).toEqual(["separator", "# Page 1", "rotatePagesLeft"]);
    expect(flat[0]).toMatchObject({ checked: true });
  });

  it("skips empty sections", () => {
    expect(flattenMenu({ palette: null, sections: [{ items: [] }, { items: [{ kind: "copy", label: "Copy" }] }] })).toEqual([{ kind: "copy", label: "Copy" }]);
  });
});
