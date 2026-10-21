import { describe, expect, it } from "vitest";
import { fuzzyMatch, rankItems } from "../src/lib/fuzzy";

describe("fuzzyMatch", () => {
  it("matches characters in order, ignoring case and spaces", () => {
    expect(fuzzyMatch("tsb", "Toggle Sidebar")?.indices).toEqual([0, 7, 11]);
    expect(fuzzyMatch("TOG side", "Toggle Sidebar")).not.toBeNull();
    expect(fuzzyMatch("bst", "Toggle Sidebar")).toBeNull();
  });

  it("matches everything with an empty query", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, indices: [] });
  });

  it("scores runs and word starts above scattered letters", () => {
    expect(fuzzyMatch("zoom", "View: Zoom In")!.score).toBeGreaterThan(fuzzyMatch("zoom", "lazy brooms")!.score);
    expect(fuzzyMatch("zi", "View: Zoom In")!.score).toBeGreaterThan(fuzzyMatch("zi", "View: Fuzzier")!.score);
  });
});

describe("rankItems", () => {
  const items = ["View: Fit Page", "Go: First Page", "File: Save", "Pages: Insert Pages from File"];

  it("keeps the original order for an empty query", () => {
    expect(rankItems("", items, (item) => item).map(({ item }) => item)).toEqual(items);
  });

  it("puts the best match first and drops misses", () => {
    const ranked = rankItems("save", items, (item) => item).map(({ item }) => item);
    expect(ranked).toEqual(["File: Save"]);
    expect(rankItems("fit", items, (item) => item)[0].item).toBe("View: Fit Page");
  });

  it("falls back to the detail text below label matches", () => {
    const files = [
      { label: "report.pdf", detail: "~/Taxes" },
      { label: "taxes-2025.pdf", detail: "~/Downloads" },
    ];
    const ranked = rankItems("taxes", files, (file) => file.label, (file) => file.detail);
    expect(ranked.map(({ item }) => item.label)).toEqual(["taxes-2025.pdf", "report.pdf"]);
    expect(ranked[1].match.indices).toEqual([]);
  });
});
