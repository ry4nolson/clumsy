import { describe, expect, it } from "vitest";
import { emptySelection, followCurrentPage, selectPage, targetPages } from "../src/lib/pageSelection";

const plain = { toggle: false, range: false };
const toggle = { toggle: true, range: false };
const range = { toggle: false, range: true };

describe("page selection", () => {
  it("selects one page on a plain click", () => {
    expect(selectPage({ pages: [1, 2], anchor: 1 }, 4, plain)).toEqual({ pages: [4], anchor: 4 });
  });

  it("toggles pages in and out", () => {
    const one = selectPage(emptySelection, 3, toggle);
    const two = selectPage(one, 1, toggle);
    expect(two.pages).toEqual([1, 3]);
    expect(selectPage(two, 3, toggle).pages).toEqual([1]);
  });

  it("selects a range from the anchor in either direction", () => {
    const start = selectPage(emptySelection, 2, plain);
    expect(selectPage(start, 5, range).pages).toEqual([2, 3, 4, 5]);
    expect(selectPage(start, 0, range).pages).toEqual([0, 1, 2]);
    expect(selectPage(emptySelection, 4, range).pages).toEqual([4]);
  });

  it("adds a range to the selection with both modifiers", () => {
    const start = selectPage(selectPage(emptySelection, 8, plain), 2, toggle);
    expect(selectPage(start, 4, { toggle: true, range: true }).pages).toEqual([2, 3, 4, 8]);
  });

  it("falls back to the current page and drops a selection the reader scrolled away from", () => {
    expect(targetPages(emptySelection, 6)).toEqual([6]);
    expect(targetPages({ pages: [1, 2], anchor: 1 }, 6)).toEqual([1, 2]);
    expect(followCurrentPage({ pages: [1, 2], anchor: 1 }, 2).pages).toEqual([1, 2]);
    expect(followCurrentPage({ pages: [1, 2], anchor: 1 }, 5)).toEqual({ pages: [], anchor: 5 });
  });
});
