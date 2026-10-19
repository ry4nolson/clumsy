import { describe, expect, it } from "vitest";
import { cycleTab, insertAfter, removeTab } from "../src/lib/tabs";

const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("insertAfter", () => {
  it("inserts right after the given tab", () => {
    expect(insertAfter(tabs, "a", { id: "x" }).map((tab) => tab.id)).toEqual(["a", "x", "b", "c"]);
  });

  it("appends when the anchor is missing", () => {
    expect(insertAfter(tabs, null, { id: "x" }).map((tab) => tab.id)).toEqual(["a", "b", "c", "x"]);
  });
});

describe("removeTab", () => {
  it("keeps the active tab when closing another", () => {
    expect(removeTab(tabs, "c", "a")).toEqual({ tabs: [{ id: "a" }, { id: "b" }], activeId: "a" });
  });

  it("activates the tab to the right of a closed active tab", () => {
    expect(removeTab(tabs, "b", "b").activeId).toBe("c");
  });

  it("falls back to the left when closing the last tab in the strip", () => {
    expect(removeTab(tabs, "c", "c").activeId).toBe("b");
  });

  it("reports no active tab when the strip empties", () => {
    expect(removeTab([{ id: "a" }], "a", "a")).toEqual({ tabs: [], activeId: null });
  });
});

describe("cycleTab", () => {
  it("wraps in both directions", () => {
    expect(cycleTab(tabs, "c", 1)).toBe("a");
    expect(cycleTab(tabs, "a", -1)).toBe("c");
    expect(cycleTab(tabs, "a", 1)).toBe("b");
  });
});
