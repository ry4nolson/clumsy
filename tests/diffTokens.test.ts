import { describe, expect, it } from "vitest";
import { tokenizePages, type PageText, type TextItem } from "../src/lib/diffTokens";

const viewport = { transform: [1, 0, 0, -1, 0, 200], width: 100, height: 200 };

const item = (str: string, x: number, y: number, extra: Partial<TextItem> = {}): TextItem => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  width: str.length * 5,
  ...extra,
});

const page = (...items: TextItem[]): PageText => ({ items, viewport });
const texts = (pages: PageText[]) => tokenizePages(pages).map((token) => token.text);

describe("tokenizePages", () => {
  it("splits items into words with boxes in page fractions", () => {
    const [hello, world] = tokenizePages([page(item("hello world", 0, 190))]);
    expect(hello.text).toBe("hello");
    expect(world.text).toBe("world");
    expect(hello.rects).toHaveLength(1);
    expect(hello.rects[0].page).toBe(0);
    expect(hello.rects[0].x).toBeCloseTo(0);
    expect(hello.rects[0].width).toBeCloseTo(25 / 100);
    expect(hello.rects[0].y).toBeCloseTo(2 / 200);
    expect(hello.rects[0].height).toBeCloseTo(10 / 200);
    expect(world.rects[0].x).toBeCloseTo(30 / 100);
  });

  it("joins items that continue a word and separates items with a gap", () => {
    expect(texts([page(item("Hel", 0, 190), item("lo", 15, 190), item("there", 30, 190))])).toEqual(["Hello", "there"]);
  });

  it("breaks words at line ends", () => {
    expect(texts([page(item("one", 0, 190, { hasEOL: true }), item("two", 0, 178))])).toEqual(["one", "two"]);
    expect(texts([page(item("one", 0, 190), item("two", 15, 178))])).toEqual(["one", "two"]);
  });

  it("joins words hyphenated across a line break", () => {
    const tokens = tokenizePages([page(item("docu-", 0, 190, { hasEOL: true }), item("ment is", 0, 178))]);
    expect(tokens.map((token) => token.text)).toEqual(["document", "is"]);
    expect(tokens[0].rects).toHaveLength(2);
  });

  it("keeps hyphens inside a line and dashes at line ends", () => {
    expect(texts([page(item("well-known", 0, 190))])).toEqual(["well-known"]);
    expect(texts([page(item("wait --", 0, 190, { hasEOL: true }), item("go", 0, 178))])).toEqual(["wait", "--", "go"]);
  });

  it("drops soft hyphens and normalizes ligatures", () => {
    expect(texts([page(item("co­opﬁx", 0, 190))])).toEqual(["coopfix"]);
  });

  it("numbers pages and keeps a trailing hyphen at the end of the document", () => {
    const tokens = tokenizePages([page(item("first", 0, 190)), page(item("second end-", 0, 190))]);
    expect(tokens.map((token) => [token.text, token.rects[0].page])).toEqual([
      ["first", 0],
      ["second", 1],
      ["end-", 1],
    ]);
  });

  it("boxes rotated text", () => {
    const [token] = tokenizePages([page({ str: "up", transform: [0, 10, -10, 0, 50, 100], width: 10 })]);
    expect(token.rects[0].height).toBeCloseTo(10 / 200);
    expect(token.rects[0].width).toBeCloseTo(10 / 100);
  });

  it("returns nothing for pages without text", () => {
    expect(tokenizePages([page(), page(item("   ", 0, 190))])).toEqual([]);
  });
});
