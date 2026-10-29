import { describe, expect, it } from "vitest";
import { diffByPage, diffWords, slideToLineStarts, type Segment } from "../src/lib/textDiff";

const words = (text: string) => text.split(" ").filter(Boolean);

describe("diffWords", () => {
  it("returns one equal segment for identical input", () => {
    expect(diffWords(words("a b c"), words("a b c"))).toEqual([{ equal: true, left: [0, 3], right: [0, 3] }]);
  });

  it("merges a removal and an addition into one change", () => {
    expect(diffWords(words("the quick fox"), words("the slow fox"))).toEqual([
      { equal: true, left: [0, 1], right: [0, 1] },
      { equal: false, left: [1, 2], right: [1, 2] },
      { equal: true, left: [2, 3], right: [2, 3] },
    ]);
  });

  it("reports pure insertions and deletions with an empty side", () => {
    expect(diffWords(words("a c"), words("a b c"))).toEqual([
      { equal: true, left: [0, 1], right: [0, 1] },
      { equal: false, left: [1, 1], right: [1, 2] },
      { equal: true, left: [1, 2], right: [2, 3] },
    ]);
    expect(diffWords(words("a b"), [])).toEqual([{ equal: false, left: [0, 2], right: [0, 0] }]);
  });

  it("gives up when the timeout passes", () => {
    expect(diffWords(words("a b"), words("c d"), -1)).toBeNull();
  });
});

describe("diffByPage", () => {
  it("uses the whole-document diff when it finishes", () => {
    const segments = diffByPage({ left: words("a b c"), right: words("a c"), leftPages: [0, 0, 1], rightPages: [0, 1] });
    expect(segments).toEqual([
      { equal: true, left: [0, 1], right: [0, 1] },
      { equal: false, left: [1, 2], right: [1, 1] },
      { equal: true, left: [2, 3], right: [1, 2] },
    ]);
  });

  it("falls back to diffing page by page and offsets the ranges", () => {
    const segments = diffByPage({ left: words("a b c d"), right: words("a x c d e"), leftPages: [0, 0, 1, 1], rightPages: [0, 0, 1, 1, 2] }, -1);
    expect(segments).toEqual([
      { equal: true, left: [0, 1], right: [0, 1] },
      { equal: false, left: [1, 2], right: [1, 2] },
      { equal: true, left: [2, 4], right: [2, 4] },
      { equal: false, left: [4, 4], right: [4, 5] },
    ]);
  });

  it("marks a page pair as one change when even that times out", () => {
    const segments = diffByPage({ left: words("a b"), right: words("c d"), leftPages: [0, 0], rightPages: [0, 0] }, -1, -1);
    expect(segments).toEqual([{ equal: false, left: [0, 2], right: [0, 2] }]);
  });
});

describe("slideToLineStarts", () => {
  it("moves an inserted line so it starts where a line starts", () => {
    const left = words("Line a x Line c x");
    const right = words("Line a x Line b x Line c x");
    const starts = { left: [true, false, false, true, false, false], right: [true, false, false, true, false, false, true, false, false] };
    const diff = [
      { equal: true, left: [0, 4], right: [0, 4] },
      { equal: false, left: [4, 4], right: [4, 7] },
      { equal: true, left: [4, 6], right: [7, 9] },
    ] satisfies Segment[];
    expect(slideToLineStarts(diff, left, right, starts)).toEqual([
      { equal: true, left: [0, 3], right: [0, 3] },
      { equal: false, left: [3, 3], right: [3, 6] },
      { equal: true, left: [3, 6], right: [6, 9] },
    ]);
  });

  it("leaves changes alone when no slide reaches a line start", () => {
    const diff = diffWords(words("the quick fox"), words("the slow fox"))!;
    expect(slideToLineStarts(diff, words("the quick fox"), words("the slow fox"), { left: [true, false, false], right: [true, false, false] })).toEqual(diff);
  });
});

describe("diffByPage budget", () => {
  it("marks remaining pages as changed once the overall budget runs out", () => {
    const segments = diffByPage({ left: words("a b c d"), right: words("a x c y"), leftPages: [0, 0, 1, 1], rightPages: [0, 0, 1, 1] }, -1, 300, -1);
    expect(segments).toEqual([{ equal: false, left: [0, 4], right: [0, 4] }]);
  });
});
