import { describe, expect, it } from "vitest";
import { longestChain, uniqueRuns } from "../src/lib/anchors";
import { EXACT_LIMIT, diffByPage } from "../src/lib/textDiff";

function prose(count: number, seed: number) {
  let state = seed >>> 0;
  return Array.from({ length: count }, () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return `w${((mixed ^ (mixed >>> 14)) >>> 0) % 5000}`;
  });
}

const pagesOf = (words: string[], perPage = 800) => words.map((_, index) => Math.floor(index / perPage));
const changed = (segments: ReturnType<typeof diffByPage>) => segments.filter((segment) => !segment.equal).map(({ left, right }) => ({ left, right }));

describe("longestChain", () => {
  it("keeps the longest run of pairs that stay in order on both sides", () => {
    expect(
      longestChain([
        [0, 5],
        [1, 1],
        [2, 2],
        [3, 0],
        [4, 3],
      ]),
    ).toEqual([
      [1, 1],
      [2, 2],
      [4, 3],
    ]);
    expect(longestChain([])).toEqual([]);
  });
});

describe("uniqueRuns", () => {
  it("matches runs that appear once on each side and skips repeated ones", () => {
    const left = "a b c d x y a b c d".split(" ");
    const right = "q a b c d x y r".split(" ");
    const runs = uniqueRuns(left, right, 2);
    for (const [leftStart, rightStart] of runs) {
      expect(left.slice(leftStart, leftStart + 2)).toEqual(right.slice(rightStart, rightStart + 2));
      expect(left.slice(leftStart, leftStart + 2)).not.toEqual(["a", "b"]);
    }
  });
});

describe("diffByPage on long documents", () => {
  const base = prose(EXACT_LIMIT, 7);

  it("finds a deleted block, an edit, and an insertion without misaligning the pages after them", () => {
    const revised = [...base.slice(0, 5000), ...base.slice(5800, 20000), "changed", "words", ...base.slice(20002, 30000), ...prose(30, 99), ...base.slice(30000)];
    expect(changed(diffByPage({ left: base, right: revised, leftPages: pagesOf(base), rightPages: pagesOf(revised) }))).toEqual([
      { left: [5000, 5800], right: [5000, 5000] },
      { left: [20000, 20002], right: [19200, 19202] },
      { left: [30000, 30000], right: [29200, 29230] },
    ]);
  });

  it("returns one equal segment for identical documents", () => {
    expect(diffByPage({ left: base, right: [...base], leftPages: pagesOf(base), rightPages: pagesOf(base) })).toEqual([
      { equal: true, left: [0, base.length], right: [0, base.length] },
    ]);
  });

  it("marks everything changed when nothing matches and the time runs out", () => {
    const other = prose(EXACT_LIMIT, 8);
    const segments = diffByPage({ left: base, right: other, leftPages: pagesOf(base), rightPages: pagesOf(other) }, -1, 300, -1);
    expect(changed(segments)).toEqual([{ left: [0, base.length], right: [0, other.length] }]);
  });

  it("pairs pages inside a stretch with nothing in common", { timeout: 20000 }, () => {
    const left = base.slice(0, 24000);
    const right = prose(24000, 8);
    const segments = diffByPage({ left, right, leftPages: pagesOf(left, 200), rightPages: pagesOf(right, 200) });
    const pagesTouched = new Set(changed(segments).map(({ left: range }) => Math.floor(range[0] / 200)));
    expect(pagesTouched.size).toBe(24000 / 200);
  });
});
