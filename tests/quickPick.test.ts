import { describe, expect, it } from "vitest";
import { RECENT_COMMAND_LIMIT, pageJumpItem, pageJumpTarget, paletteItems, quickOpenItems, quickOpenTarget, rememberCommand } from "../src/lib/quickPick";
import type { RecentEntry } from "../src/lib/recent";

const recent = (path: string, exists = true): RecentEntry => ({
  path,
  name: path.split("/").pop()!,
  location: path.split("/").slice(0, -1).join("/").replace("/Users/ryan", "~"),
  openedAt: 0,
  exists,
});

describe("paletteItems", () => {
  it("lists menu commands with their menu and shortcut", () => {
    const items = paletteItems({ hasDocument: true, split: true, comparing: true, isMac: true });
    expect(items.find((item) => item.id === "toggleSidebar")).toEqual({ id: "toggleSidebar", label: "View: Toggle Sidebar", hint: "⌘B" });
    expect(items.find((item) => item.id === "goToPage")?.label).toBe("Go: Go to Page");
    expect(items.find((item) => item.id === "combineFiles")?.hint).toBeNull();
  });

  it("leaves out itself, Escape, and the tab number commands", () => {
    const ids = paletteItems({ hasDocument: true, split: true, comparing: true, isMac: true }).map((item) => item.id);
    expect(ids).not.toContain("commandPalette");
    expect(ids).not.toContain("escape");
    expect(ids).not.toContain("tab1");
  });

  it("lists recently run commands first and the app menu last", () => {
    const ids = paletteItems({ hasDocument: true, split: true, comparing: true, isMac: true }, ["zoomIn", "save"]).map((item) => item.id);
    expect(ids.slice(0, 3)).toEqual(["zoomIn", "save", "newTab"]);
    expect(ids.at(-1)).toBe("quit");
  });

  it("remembers a few recent commands, newest first", () => {
    let recentIds = rememberCommand([], "save");
    recentIds = rememberCommand(recentIds, "zoomIn");
    recentIds = rememberCommand(recentIds, "save");
    expect(recentIds).toEqual(["save", "zoomIn"]);
    for (const id of ["open", "find", "fitPage", "fitWidth", "zoomOut"] as const) {
      recentIds = rememberCommand(recentIds, id);
    }
    expect(recentIds).toHaveLength(RECENT_COMMAND_LIMIT);
    expect(recentIds[0]).toBe("zoomOut");
  });

  it("hides commands that can't run right now", () => {
    const ids = paletteItems({ hasDocument: false, split: false, comparing: false, isMac: true }).map((item) => item.id);
    expect(ids).not.toContain("save");
    expect(ids).not.toContain("closeSplit");
    expect(ids).not.toContain("focusLeftPane");
    expect(ids).not.toContain("nextChange");
    expect(ids).not.toContain("compareWithFile");
    expect(ids).toContain("open");
    expect(ids).toContain("moveTabRight");
  });

  it("hides the Document Map toggle while the map can't show", () => {
    const context = { hasDocument: true, split: false, comparing: false, isMac: true };
    expect(paletteItems(context).map((item) => item.id)).toContain("toggleDocumentMap");
    expect(paletteItems({ ...context, documentMapAvailable: false }).map((item) => item.id)).not.toContain("toggleDocumentMap");
  });
});

describe("quickOpenItems", () => {
  it("lists open tabs first, then recent files that aren't open", () => {
    const items = quickOpenItems(
      [
        { id: "t1", name: "b.pdf", path: "/Users/ryan/Docs/b.pdf" },
        { id: "t2", name: "Extracted Pages", path: null },
      ],
      [recent("/Users/ryan/Docs/a.pdf"), recent("/Users/ryan/Docs/b.pdf"), recent("/Users/ryan/gone.pdf", false)],
    );
    expect(items).toEqual([
      { id: "tab:t1", label: "b.pdf", detail: "~/Docs", hint: "open" },
      { id: "tab:t2", label: "Extracted Pages", detail: "Not saved yet", hint: "open" },
      { id: "recent:/Users/ryan/Docs/a.pdf", label: "a.pdf", detail: "~/Docs" },
    ]);
  });

  it("falls back to the parent folder for tabs not in recent files", () => {
    expect(quickOpenItems([{ id: "t1", name: "c.pdf", path: "/tmp/x/c.pdf" }], [])[0].detail).toBe("/tmp/x");
  });
});

describe("quickOpenTarget", () => {
  it("parses item ids", () => {
    expect(quickOpenTarget("tab:t1")).toEqual({ kind: "tab", tabId: "t1" });
    expect(quickOpenTarget("recent:/a/b:c.pdf")).toEqual({ kind: "recent", path: "/a/b:c.pdf" });
    expect(quickOpenTarget("other")).toBeNull();
  });
});

describe("comparison commands in the palette", () => {
  it("offers change navigation only while comparing", () => {
    const ids = paletteItems({ hasDocument: true, split: true, comparing: true, isMac: true }).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(["compareWithFile", "compareSplitPanes", "nextChange", "endComparison"]));
    expect(paletteItems({ hasDocument: true, split: true, comparing: false, isMac: true }).map((item) => item.id)).not.toContain("nextChange");
  });
});

describe("pageJumpItem", () => {
  const labels = ["i", "ii", "1", "2", "3"];

  it("only answers queries that start with a colon", () => {
    expect(pageJumpItem("12", { labels: null, count: 20 })).toBeNull();
    expect(pageJumpItem(":3", { labels: null, count: 0 })).toBeNull();
  });

  it("goes to a page number or a label", () => {
    expect(pageJumpItem(":12", { labels: null, count: 20 })).toEqual({ id: "page:12", label: "Go to page 12 of 20" });
    expect(pageJumpItem(":ii", { labels, count: 5 })).toEqual({ id: "page:2", label: "Go to page ii (2 of 5)" });
    expect(pageJumpItem(": 3", { labels, count: 5 })).toEqual({ id: "page:5", label: "Go to page 3 (5 of 5)" });
  });

  it("explains an empty or unknown page", () => {
    expect(pageJumpItem(":", { labels, count: 5 })).toEqual({ id: "page:", label: "Type a page number or label (1–5)" });
    expect(pageJumpItem(":", { labels: null, count: 5 })?.label).toBe("Type a page number (1–5)");
    expect(pageJumpItem(":xiv", { labels, count: 5 })).toEqual({ id: "page:", label: "No page “xiv”" });
  });

  it("reads the page back from the item", () => {
    expect(pageJumpTarget("page:7")).toBe(7);
    expect(pageJumpTarget("page:")).toBeNull();
    expect(pageJumpTarget("tab:page:7")).toBeNull();
  });
});
