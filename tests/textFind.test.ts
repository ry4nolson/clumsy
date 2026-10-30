import { describe, expect, it } from "vitest";
import { findInText, matchNear, stepMatch, type TextQuery } from "../src/lib/textFind";

const query = (text: string, options: Partial<TextQuery> = {}): TextQuery => ({
  query: text,
  caseSensitive: false,
  entireWord: false,
  matchDiacritics: false,
  regex: false,
  ...options,
});

const found = (text: string, q: TextQuery) => findInText(text, q).map(({ start, end }) => text.slice(start, end));

describe("findInText", () => {
  it("matches plain text case-insensitively and escapes regex characters", () => {
    expect(found("Cost (USD) and cost", query("cost"))).toEqual(["Cost", "cost"]);
    expect(found("Cost (USD)", query("(usd)"))).toEqual(["(USD)"]);
    expect(found("Cost cost", query("cost", { caseSensitive: true }))).toEqual(["cost"]);
  });

  it("supports whole words and regular expressions", () => {
    expect(found("cat concat cats", query("cat", { entireWord: true }))).toEqual(["cat"]);
    expect(found("v1.2 and v10.4", query("v\\d+\\.\\d", { regex: true }))).toEqual(["v1.2", "v10.4"]);
    expect(findInText("abc", query("(", { regex: true }))).toEqual([]);
  });

  it("ignores accents unless asked, and maps matches back to the original text", () => {
    const text = "Café cafe CAFÉ";
    expect(found(text, query("cafe"))).toEqual(["Café", "cafe", "CAFÉ"]);
    expect(found(text, query("café", { matchDiacritics: true }))).toEqual(["Café", "CAFÉ"]);
  });

  it("keeps offsets right after characters outside the basic plane", () => {
    expect(found("😀 note 😀 note", query("note"))).toEqual(["note", "note"]);
  });
});

describe("match navigation", () => {
  it("picks the first match at or after a position and wraps when stepping", () => {
    const matches = [{ start: 0, end: 2 }, { start: 10, end: 12 }, { start: 20, end: 22 }];
    expect(matchNear(matches, 0)).toBe(0);
    expect(matchNear(matches, 11)).toBe(1);
    expect(matchNear(matches, 30)).toBe(0);
    expect(stepMatch(2, 3, false)).toBe(0);
    expect(stepMatch(0, 3, true)).toBe(2);
    expect(stepMatch(0, 0, false)).toBe(-1);
  });
});
