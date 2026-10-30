import { describe, expect, it } from "vitest";
import { formatPageRange, parsePageRange } from "../src/lib/pageRanges";

describe("parsePageRange", () => {
  it("reads single pages and spans as zero-based page indices", () => {
    expect(parsePageRange("1-3, 5", 10)).toEqual([0, 1, 2, 4]);
    expect(parsePageRange(" 7 ", 10)).toEqual([6]);
  });

  it("sorts, removes duplicates, and accepts reversed spans", () => {
    expect(parsePageRange("5, 2-3, 3, 4–2", 10)).toEqual([1, 2, 3, 4]);
  });

  it("treats an open end as the first or last page", () => {
    expect(parsePageRange("8-", 10)).toEqual([7, 8, 9]);
    expect(parsePageRange("-2", 10)).toEqual([0, 1]);
  });

  it("rejects text that isn't a range or pages the document doesn't have", () => {
    expect(parsePageRange("", 10)).toBeNull();
    expect(parsePageRange("-", 10)).toBeNull();
    expect(parsePageRange("0", 10)).toBeNull();
    expect(parsePageRange("3-11", 10)).toBeNull();
    expect(parsePageRange("two", 10)).toBeNull();
    expect(parsePageRange("1-2-3", 10)).toBeNull();
  });
});

describe("formatPageRange", () => {
  it("writes runs as spans", () => {
    expect(formatPageRange([0, 1, 2, 4, 6, 7])).toBe("1-3, 5, 7-8");
    expect(formatPageRange([3])).toBe("4");
    expect(formatPageRange([])).toBe("");
  });

  it("round-trips through parsePageRange", () => {
    expect(parsePageRange(formatPageRange([9, 0, 1, 5]), 10)).toEqual([0, 1, 5, 9]);
  });
});
