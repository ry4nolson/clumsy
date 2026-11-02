import { describe, expect, it } from "vitest";
import { compareComments, dropComments, placeCommentDialog, removedMessage, upsertComment, withoutTextBoxComment, type CommentEntry } from "../src/lib/comments";

const comment = (id: string, patch: Partial<CommentEntry> = {}): CommentEntry => ({ id, pageIndex: 0, rect: [10, 10, 50, 50], time: null, text: id, color: null, ...patch });

describe("compareComments", () => {
  it("puts newer comments first and undated ones last", () => {
    const list = [comment("old", { time: 1 }), comment("none"), comment("new", { time: 5 })].sort(compareComments);
    expect(list.map((item) => item.id)).toEqual(["new", "old", "none"]);
  });

  it("orders undated comments by page, then top to bottom, then left to right", () => {
    const list = [
      comment("page2", { pageIndex: 1, rect: [0, 0, 10, 900] }),
      comment("lower", { rect: [0, 0, 10, 100] }),
      comment("right", { rect: [200, 0, 210, 500] }),
      comment("left", { rect: [20, 0, 30, 500] }),
    ].sort(compareComments);
    expect(list.map((item) => item.id)).toEqual(["left", "right", "lower", "page2"]);
  });
});

describe("upsertComment and dropComments", () => {
  it("replaces an existing comment and keeps the order", () => {
    const list = [comment("a", { time: 3 }), comment("b", { time: 2 })];
    const updated = upsertComment(list, comment("b", { time: 4, text: "edited" }));
    expect(updated.map((item) => [item.id, item.text])).toEqual([
      ["b", "edited"],
      ["a", "a"],
    ]);
  });

  it("drops comments by id", () => {
    expect(dropComments([comment("a"), comment("b"), comment("c")], ["a", "c"]).map((item) => item.id)).toEqual(["b"]);
  });
});

describe("removedMessage", () => {
  it("names what was removed", () => {
    expect(removedMessage("highlight")).toBe("Highlight removed");
    expect(removedMessage("signature")).toBe("Signature removed");
    expect(removedMessage(1)).toBe("1 annotation removed");
    expect(removedMessage(3)).toBe("3 annotations removed");
    expect(removedMessage("unknown")).toBe("Annotation removed");
  });
});

describe("placeCommentDialog", () => {
  const viewport = { width: 1000, height: 800 };

  it("keeps the dialog where pdf.js asked when it fits", () => {
    expect(placeCommentDialog({ x: 100, y: 200, height: null, anchor: null }, 300, 200, viewport)).toEqual({ x: 100, y: 200 });
  });

  it("flips left of the comment button when it would pass the page's right edge", () => {
    expect(placeCommentDialog({ x: 600, y: 100, height: null, anchor: { right: 700, buttonWidth: 20 } }, 300, 200, viewport)).toEqual({ x: 320, y: 100 });
  });

  it("stays inside the window", () => {
    expect(placeCommentDialog({ x: 900, y: 750, height: 300, anchor: null }, 300, 200, viewport)).toEqual({ x: 692, y: 492 });
    expect(placeCommentDialog({ x: -50, y: -20, height: null, anchor: null }, 300, 200, viewport)).toEqual({ x: 8, y: 8 });
  });
});

describe("withoutTextBoxComment", () => {
  const contentsObj = { str: "test2", dir: "ltr" };

  it("drops a text box's own text so it isn't shown as a comment", () => {
    const textBox = { annotationType: 3, popupRef: null, contentsObj, richText: { str: "test2" }, id: "28R" };
    expect(withoutTextBoxComment(textBox)).toEqual({ annotationType: 3, popupRef: null, contentsObj: null, richText: null, id: "28R" });
    expect(textBox.contentsObj).toBe(contentsObj);
  });

  it("keeps a text box's comment when the file gave it a popup", () => {
    const textBox = { annotationType: 3, popupRef: "29R", contentsObj };
    expect(withoutTextBoxComment(textBox)).toBe(textBox);
  });

  it("keeps comments on other annotations", () => {
    const note = { annotationType: 1, popupRef: null, contentsObj };
    const highlight = { annotationType: 9, popupRef: "25R", contentsObj };
    expect(withoutTextBoxComment(note)).toBe(note);
    expect(withoutTextBoxComment(highlight)).toBe(highlight);
  });
});
