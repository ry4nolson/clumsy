import { describe, expect, it } from "vitest";
import { compileFindPattern, escapeFindPattern, findPatternMatches, isInvalidFindPattern } from "../src/lib/findPattern";

const matches = (source: string, content: string, { caseSensitive = false, entireWord = false } = {}) =>
  findPatternMatches(compileFindPattern(source, caseSensitive)!, content, entireWord);

describe("compileFindPattern", () => {
  it("ignores case unless asked not to", () => {
    expect(compileFindPattern("print", false)!.test("PRINT")).toBe(true);
    expect(compileFindPattern("print", true)!.test("PRINT")).toBe(false);
  });

  it("accepts Unicode property escapes", () => {
    expect(compileFindPattern("\\p{Lu}", true)!.test("É")).toBe(true);
  });

  it("falls back to non-Unicode syntax for patterns only that accepts", () => {
    expect(compileFindPattern("a\\-b", false)!.test("a-b")).toBe(true);
  });

  it("returns null for an empty or invalid pattern", () => {
    expect(compileFindPattern("", false)).toBeNull();
    expect(compileFindPattern("(unclosed", false)).toBeNull();
  });
});

describe("isInvalidFindPattern", () => {
  it("only flags non-empty patterns that fail to compile in regex mode", () => {
    expect(isInvalidFindPattern("(", true, false)).toBe(true);
    expect(isInvalidFindPattern("(", false, false)).toBe(false);
    expect(isInvalidFindPattern("", true, false)).toBe(false);
    expect(isInvalidFindPattern("a+", true, false)).toBe(false);
  });
});

describe("findPatternMatches", () => {
  it("finds every match with its position and length", () => {
    expect(matches("PO-\\d+", "See PO-12 and po-345.")).toEqual([
      { index: 4, length: 5 },
      { index: 14, length: 6 },
    ]);
  });

  it("skips empty matches instead of looping forever", () => {
    expect(matches("x*", "axxb")).toEqual([{ index: 1, length: 2 }]);
  });

  it("keeps only whole words when asked", () => {
    expect(matches("print\\w*", "print reprint printing", { entireWord: true })).toEqual([
      { index: 0, length: 5 },
      { index: 14, length: 8 },
    ]);
  });

  it("treats a match that starts or ends on punctuation as a word edge", () => {
    expect(matches("\\(beta\\)", "Shop(beta) x", { entireWord: true })).toEqual([{ index: 4, length: 6 }]);
  });

  it("does not depend on the pattern's lastIndex", () => {
    const pattern = compileFindPattern("a", false)!;
    pattern.lastIndex = 3;
    expect(findPatternMatches(pattern, "aaa", false)).toHaveLength(3);
  });
});

describe("escapeFindPattern", () => {
  it("makes selected text match itself literally", () => {
    const text = "Print Shop (Beta) $5.00 [a|b] 1+1? a/b";
    expect(findPatternMatches(compileFindPattern(escapeFindPattern(text), true)!, text, false)).toEqual([{ index: 0, length: text.length }]);
  });
});

describe("diacritics", () => {
  const page = "Le café crème, Café noir, cafe, naïve".normalize("NFD");
  const found = (source: string, matchDiacritics: boolean, { caseSensitive = false, entireWord = false } = {}) =>
    findPatternMatches(compileFindPattern(source, caseSensitive, matchDiacritics)!, page, entireWord, matchDiacritics).map(({ index, length }) =>
      page.slice(index, index + length).normalize("NFC"),
    );

  it("ignores accents by default, in the pattern and on the page", () => {
    expect(found("cafe", false)).toEqual(["café", "Café", "cafe"]);
    expect(found("café", false)).toEqual(["café", "Café", "cafe"]);
    expect(found("caf.", false)).toEqual(["café", "Café", "cafe"]);
    expect(found("naive", false)).toEqual(["naïve"]);
  });

  it("covers the whole accented letter in the match", () => {
    const content = "café".normalize("NFD");
    expect(findPatternMatches(compileFindPattern("caf", false)!, content, false)).toEqual([{ index: 0, length: 3 }]);
    expect(findPatternMatches(compileFindPattern("cafe", false)!, content, false)).toEqual([{ index: 0, length: 5 }]);
  });

  it("matches accents exactly when asked", () => {
    expect(found("café", true)).toEqual(["café", "Café"]);
    expect(found("cafe", true)).toEqual(["cafe"]);
    expect(found("caf\\w", true)).toEqual(["cafe"]);
    expect(found("Café", true, { caseSensitive: true })).toEqual(["Café"]);
  });

  it("still respects whole words", () => {
    expect(found("caf", false, { entireWord: true })).toEqual([]);
    expect(found("cafe", false, { entireWord: true })).toEqual(["café", "Café", "cafe"]);
  });

  it("keeps marks that change a letter, not just its accent", () => {
    const hindi = "क्ष".normalize("NFD");
    expect(findPatternMatches(compileFindPattern("कष", false)!, hindi, false)).toEqual([]);
    expect(findPatternMatches(compileFindPattern("क्ष", false)!, hindi, false)).toEqual([{ index: 0, length: 3 }]);
  });
});
