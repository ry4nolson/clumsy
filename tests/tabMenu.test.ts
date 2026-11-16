import { describe, expect, it } from "vitest";
import type { MenuEntry } from "../src/lib/documentMenu";
import { comparedTabId, tabMenu, tabsToRight, type TabMenuContext } from "../src/lib/tabMenu";

const base: TabMenuContext = {
  tab: { id: "b", kind: "document", path: "/docs/b.pdf", protected: false },
  paneTabIds: ["a", "b", "c"],
  comparable: [
    { id: "a", name: "a.pdf" },
    { id: "b", name: "b.pdf" },
  ],
  revealLabel: "Show in Finder",
  canPrint: true,
  canSplit: true,
};

const labels = (items: MenuEntry[]): string[] => items.map((entry) => (entry.kind === "separator" ? "-" : entry.label));
const menu = (overrides: Partial<TabMenuContext> = {}) => tabMenu({ ...base, ...overrides });
const sectionLabels = (overrides: Partial<TabMenuContext> = {}) => menu(overrides).sections.map((section) => labels(section.items));
const find = (overrides: Partial<TabMenuContext>, label: string) =>
  menu(overrides)
    .sections.flatMap((section) => section.items)
    .find((entry) => entry.kind !== "separator" && entry.label === label);

describe("tabsToRight", () => {
  it("lists the tabs after this one in its pane", () => {
    expect(tabsToRight(["a", "b", "c"], "a")).toEqual(["b", "c"]);
    expect(tabsToRight(["a", "b", "c"], "c")).toEqual([]);
    expect(tabsToRight(["a"], "missing")).toEqual([]);
  });
});

describe("comparedTabId", () => {
  it("reads the tab out of a compare item and ignores other ids", () => {
    expect(comparedTabId("compareWithTab:tab-7")).toBe("tab-7");
    expect(comparedTabId("closeTab")).toBeNull();
  });
});

describe("tabMenu", () => {
  it("offers every file action for a saved PDF", () => {
    expect(menu().palette).toBeNull();
    expect(sectionLabels()).toEqual([
      ["Close Tab", "Close Other Tabs", "Close Tabs to the Right"],
      ["Save", "Save As…"],
      ["Copy Path", "Show in Finder"],
      ["Compare With", "Split Right", "Move Tab to New Window"],
      ["Print…", "Export Pages as Images…", "Compress…", "Set Password…"],
    ]);
  });

  it("lists the other open PDFs to compare with, then a file picker", () => {
    const compare = find({}, "Compare With");
    expect(compare?.kind === "submenu" && compare.items).toEqual([
      { kind: "item", id: "compareWithTab:a", label: "a.pdf", enabled: true },
      { kind: "separator" },
      { kind: "item", id: "compareWithFile", label: "File…", enabled: true },
    ]);
    const alone = find({ comparable: [{ id: "b", name: "b.pdf" }] }, "Compare With");
    expect(alone?.kind === "submenu" && labels(alone.items)).toEqual(["File…"]);
  });

  it("disables closing others and tabs to the right when there are none", () => {
    expect(find({ paneTabIds: ["b"] }, "Close Other Tabs")).toMatchObject({ enabled: false });
    expect(find({ paneTabIds: ["a", "b"] }, "Close Tabs to the Right")).toMatchObject({ enabled: false });
    expect(find({ paneTabIds: ["a", "b"] }, "Close Other Tabs")).toMatchObject({ enabled: true });
  });

  it("leaves out path items for a file that was never saved", () => {
    expect(sectionLabels({ tab: { ...base.tab, path: null } })[2]).toEqual(["Compare With", "Split Right", "Move Tab to New Window"]);
  });

  it("offers Change and Remove Password on a protected PDF", () => {
    expect(sectionLabels({ tab: { ...base.tab, protected: true } }).at(-1)).toEqual(["Print…", "Export Pages as Images…", "Compress…", "Change Password…", "Remove Password"]);
  });

  it("keeps a Markdown tab to what Markdown can do", () => {
    expect(sectionLabels({ tab: { id: "b", kind: "markdown", path: "/docs/b.md", protected: false }, canPrint: false })).toEqual([
      ["Close Tab", "Close Other Tabs", "Close Tabs to the Right"],
      ["Save", "Save As…"],
      ["Copy Path", "Show in Finder"],
      ["Split Right", "Move Tab to New Window"],
      [],
    ]);
  });

  it("only closes and arranges a Start tab", () => {
    expect(sectionLabels({ tab: { id: "b", kind: "start", path: null, protected: false }, canSplit: false })).toEqual([
      ["Close Tab", "Close Other Tabs", "Close Tabs to the Right"],
      ["Split Right", "Move Tab to New Window"],
    ]);
    expect(find({ canSplit: false }, "Split Right")).toMatchObject({ enabled: false });
  });
});
