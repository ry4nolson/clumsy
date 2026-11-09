import { describe, expect, it } from "vitest";
import {
  MARKUP_KEY_PREFIX,
  colorFromHex,
  editedFileIds,
  hexColor,
  markupIn,
  movedMarkup,
  newMarkup,
  removedMarkup,
  reshapedMarkup,
  restyledMarkup,
  sameStyle,
  visibleMarkup,
  type Markup,
} from "../src/lib/markup";

const style = { color: [1, 0, 0], fill: false, width: 2, opacity: 1 };
const date = "D:20261107Z";
const make = (patch: Partial<Markup> & Pick<Markup, "id">) => newMarkup({ pageIndex: 0, kind: "rectangle", box: [10, 10, 50, 50], ...patch }, style, date);

describe("markup model", () => {
  it("normalizes a box drawn from any corner", () => {
    expect(make({ id: "a", box: [50, 80, 10, 20] }).box).toEqual([10, 20, 50, 80]);
  });

  it("gives arrows and lines their endings", () => {
    expect(make({ id: "a", kind: "arrow" }).endings).toEqual(["None", "OpenArrow"]);
    expect(make({ id: "b", kind: "line" }).endings).toEqual(["None", "None"]);
    expect(make({ id: "c" }).endings).toBeNull();
  });

  it("reads only markup entries from storage and keeps file order with changes applied", () => {
    const file = make({ id: "12R", fresh: false });
    const other = make({ id: "13R", fresh: false, pageIndex: 1 });
    const moved = movedMarkup(file, 5, -5, date);
    const fresh = make({ id: "markup-1" });
    const storage = new Map<string, unknown>([
      ["pdfjs_internal_editor_0", { annotationType: 3 }],
      [MARKUP_KEY_PREFIX + moved.id, moved],
      [MARKUP_KEY_PREFIX + fresh.id, fresh],
      [MARKUP_KEY_PREFIX + other.id, { ...other, deleted: true }],
    ]);
    const changes = markupIn(storage);
    expect(changes.map((markup) => markup.id)).toEqual(["12R", "markup-1", "13R"]);
    expect(visibleMarkup([file, other], changes).map((markup) => markup.id)).toEqual(["12R", "markup-1"]);
    expect(visibleMarkup([file, other], changes, 0)[0].box).toEqual([15, 5, 55, 45]);
    expect([...editedFileIds(changes)]).toEqual(["12R", "13R"]);
  });

  it("moves every coordinate it has", () => {
    const strike = make({ id: "s", kind: "strikeout", quads: [0, 10, 20, 10, 0, 0, 20, 0], box: [0, 0, 20, 10] });
    expect(movedMarkup(strike, 1, 2, date).quads).toEqual([1, 12, 21, 12, 1, 2, 21, 2]);
    const line = make({ id: "l", kind: "line", line: [0, 0, 10, 10], box: [0, 0, 10, 10] });
    expect(movedMarkup(line, 1, 2, date)).toMatchObject({ line: [1, 2, 11, 12], box: [1, 2, 11, 12] });
  });

  it("reshapes a line by its endpoints and keeps its box in step", () => {
    const line = make({ id: "l", kind: "line", line: [0, 0, 10, 10], box: [0, 0, 10, 10] });
    expect(reshapedMarkup(line, { line: [20, 5, 0, 15] }, date)).toMatchObject({ line: [20, 5, 0, 15], box: [0, 5, 20, 15] });
  });

  it("restyles, filling only shapes that can be filled", () => {
    const shape = make({ id: "r" });
    expect(restyledMarkup(shape, { fill: true, color: [0, 0, 1] }, date)).toMatchObject({ color: [0, 0, 1], fill: [0, 0, 1] });
    expect(restyledMarkup(make({ id: "a", kind: "arrow" }), { fill: true }, date).fill).toBeNull();
    expect(restyledMarkup(make({ id: "st", kind: "stamp", width: 0 }), { width: 5 }, date).width).toBe(0);
    expect(sameStyle(shape, { color: [1, 0, 0], width: 2 })).toBe(true);
    expect(sameStyle(shape, { opacity: 0.5 })).toBe(false);
  });

  it("drops a new markup on delete but marks a file one deleted", () => {
    expect(removedMarkup(make({ id: "n" }), date)).toBeNull();
    expect(removedMarkup(make({ id: "9R", fresh: false }), date)).toMatchObject({ id: "9R", deleted: true });
  });

  it("converts colors both ways", () => {
    expect(hexColor([1, 0.5, 0])).toBe("#ff8000");
    expect(colorFromHex("#ff8000").map((value) => Math.round(value * 255))).toEqual([255, 128, 0]);
    expect(colorFromHex("nope")).toEqual(colorFromHex("#e5484d"));
  });
});
