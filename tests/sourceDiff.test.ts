import { ChangeSet, Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { anchorLines, anchorOf, buildChunks, diffMarks, mapAnchor } from "../src/lib/markdownDiff";
import { chunkKind, describeLines, lineChunks, lineTotals, mapLine, placeAfterEdit, sideChanges, steppedIndex, type LineChunk } from "../src/lib/sourceDiff";

const doc = (text: string) => Text.of(text.split("\n"));

const compare = (before: string, after: string) => {
  const left = doc(before);
  const right = doc(after);
  const chunks = buildChunks(left, right);
  return { left, right, chunks, lines: chunks.map(({ left, right }) => ({ left, right })) };
};

describe("buildChunks", () => {
  it("gives each chunk's line range on both sides", () => {
    const { lines } = compare("one\ntwo\nthree\nfour", "one\n2\nthree\nfour");
    expect(lines).toEqual([{ left: [1, 2], right: [1, 2] }]);
    expect(lines.map(chunkKind)).toEqual(["modified"]);
  });

  it("reads lines added in the middle and at the end as empty on the original side", () => {
    expect(compare("one\ntwo", "one\nnew\ntwo").lines).toEqual([{ left: [1, 1], right: [1, 2] }]);
    const { lines } = compare("one\ntwo\n", "one\ntwo\nthree\nfour\n");
    expect(lines).toEqual([{ left: [2, 2], right: [2, 4] }]);
    expect(lines.map(chunkKind)).toEqual(["added"]);
    expect(lineTotals(lines)).toEqual({ added: 2, removed: 0 });
  });

  it("reads removed lines as empty on the changed side", () => {
    const { lines } = compare("one\ntwo\nthree", "one\nthree");
    expect(lines).toEqual([{ left: [1, 2], right: [1, 1] }]);
    expect(lines.map(chunkKind)).toEqual(["removed"]);
  });

  it("finds nothing in identical text", () => {
    expect(compare("same\ntext", "same\ntext").lines).toEqual([]);
  });
});

describe("lineChunks", () => {
  const numbered = (count: number) => Array.from({ length: count }, (_, index) => `Paragraph ${index + 1}`);

  it("keeps separate changes apart in a long file with lines added at the top", () => {
    const left = numbered(600);
    const right = ["New A", "", "New B", ...left.slice(0, 199), "Edited 200", ...left.slice(200, 450), ...left.slice(452)];
    expect(lineChunks(left, right)).toEqual([
      { left: [0, 0], right: [0, 3] },
      { left: [199, 200], right: [202, 203] },
      { left: [450, 452], right: [453, 453] },
    ]);
  });

  it("falls back to one chunk between the common start and end when the diff times out", () => {
    const left = ["same", ...numbered(3000), "end"];
    const right = ["same", ...numbered(3000).reverse(), "end"];
    expect(lineChunks(left, right, -1)).toEqual([{ left: [1, 3001], right: [1, 3001] }]);
  });
});

describe("diffMarks", () => {
  it("marks changed lines and the changed text inside them on each side", () => {
    const { left, right, chunks, lines } = compare("alpha\nthe quick brown fox\nomega", "alpha\nthe quick red fox\nomega");
    const original = diffMarks(chunks, "left", left, -1);
    expect(original.lines).toEqual([{ from: 6, className: "diff-line modified" }]);
    expect(original.text.map(({ from, to }) => left.sliceString(from, to)).join("")).toContain("brown");
    const changed = diffMarks(chunks, "right", right, 0);
    expect(changed.lines).toEqual([{ from: 6, className: "diff-line modified diff-current" }]);
    expect(changed.text.map(({ from, to }) => right.sliceString(from, to)).join("")).toContain("red");
  });

  it("puts a gap marker where the other side has lines this side lacks", () => {
    const { left, right, chunks } = compare("one\ntwo", "one\nnew\ntwo");
    expect(diffMarks(chunks, "left", left, -1)).toEqual({ lines: [{ from: 4, className: "diff-gap added" }], text: [] });
    expect(diffMarks(chunks, "right", right, -1)).toEqual({ lines: [{ from: 4, className: "diff-line added" }], text: [] });
  });

  it("marks a gap after the last line when lines were added at the end", () => {
    const { left, right, chunks } = compare("one\ntwo", "one\ntwo\nthree");
    expect(diffMarks(chunks, "left", left, -1).lines).toEqual([{ from: 4, className: "diff-gap after added" }]);
    expect(diffMarks(chunks, "right", right, -1).lines).toEqual([{ from: 8, className: "diff-line added" }]);
  });

  it("keeps every mark inside the document", () => {
    const pairs = [
      ["a\nb\nc", "a\nB\nc\nd\ne"],
      ["a\nb\nc\nd", "a"],
      ["a\nb\n", ""],
      ["", "a\nb"],
    ];
    for (const [before, after] of pairs) {
      const { left, right, chunks } = compare(before, after);
      for (const [side, text] of [["left", left], ["right", right]] as const) {
        const marks = diffMarks(chunks, side, text, -1);
        expect(marks.lines.length).toBeGreaterThan(0);
        expect(marks.lines.every(({ from }) => from >= 0 && from <= text.length && text.lineAt(from).from === from)).toBe(true);
        expect(marks.text.every(({ from, to }) => from < to && to <= text.length)).toBe(true);
      }
    }
  });
});

describe("sideChanges", () => {
  it("lists one side's line ranges with their kind and the current change", () => {
    const chunks: LineChunk[] = [
      { left: [1, 2], right: [1, 2] },
      { left: [5, 5], right: [5, 7] },
    ];
    expect(sideChanges(chunks, "left", 1)).toEqual([
      { start: 1, end: 2, kind: "modified", current: false },
      { start: 5, end: 5, kind: "added", current: true },
    ]);
    expect(sideChanges(chunks, "right", -1)[1]).toEqual({ start: 5, end: 7, kind: "added", current: false });
  });
});

describe("mapLine", () => {
  const chunks: LineChunk[] = [
    { left: [2, 4], right: [2, 3] },
    { left: [10, 10], right: [9, 14] },
  ];

  it("keeps lines before the first change", () => {
    expect(mapLine(chunks, "left", 1.5)).toBe(1.5);
  });

  it("scales a position inside a change to the other side's lines", () => {
    expect(mapLine(chunks, "left", 3)).toBe(2.5);
    expect(mapLine(chunks, "right", 2.5)).toBe(3);
  });

  it("shifts lines after a change by what it added or removed", () => {
    expect(mapLine(chunks, "left", 6)).toBe(5);
    expect(mapLine(chunks, "left", 12)).toBe(16);
    expect(mapLine(chunks, "right", 16)).toBe(12);
  });

  it("maps lines that only exist on one side onto the gap", () => {
    expect(mapLine(chunks, "right", 9)).toBe(10);
    expect(mapLine(chunks, "right", 13.5)).toBe(10);
    expect(mapLine(chunks, "left", 10)).toBe(14);
  });

  it("stays continuous at chunk edges", () => {
    for (const edge of [2, 4]) {
      expect(mapLine(chunks, "left", edge - 0.001)).toBeCloseTo(mapLine(chunks, "left", edge), 1);
    }
  });
});

describe("describeLines and steppedIndex", () => {
  it("names only the kinds that changed", () => {
    expect(describeLines({ added: 1, removed: 0 })).toBe("1 line added");
    expect(describeLines({ added: 3, removed: 2 })).toBe("3 lines added, 2 lines removed");
    expect(describeLines({ added: 0, removed: 0 })).toBe("");
  });

  it("starts at an end and wraps around", () => {
    expect(steppedIndex(-1, 3, 1)).toBe(0);
    expect(steppedIndex(-1, 3, -1)).toBe(2);
    expect(steppedIndex(2, 3, 1)).toBe(0);
    expect(steppedIndex(0, 3, -1)).toBe(2);
    expect(steppedIndex(0, 0, 1)).toBe(-1);
  });

  it("keeps the current change through an edit elsewhere, and resumes beside one that went away", () => {
    const chunks: LineChunk[] = [
      { left: [2, 3], right: [2, 3] },
      { left: [8, 9], right: [8, 9] },
      { left: [20, 20], right: [20, 22] },
    ];
    expect(placeAfterEdit(chunks, [8, 9])).toEqual({ current: 1, resume: 1 });
    const gone = placeAfterEdit(chunks, [12, 13]);
    expect(gone).toEqual({ current: -1, resume: 2 });
    expect(steppedIndex(gone.current, chunks.length, 1, gone.resume)).toBe(2);
    expect(steppedIndex(gone.current, chunks.length, -1, gone.resume)).toBe(1);
    expect(steppedIndex(-1, chunks.length, 1, 3)).toBe(0);
  });

  it("keeps a change that shrank from its first line", () => {
    const chunks: LineChunk[] = [
      { left: [2, 3], right: [2, 3] },
      { left: [9, 12], right: [9, 12] },
    ];
    expect(placeAfterEdit(chunks, [8, 12])).toEqual({ current: 1, resume: 1 });
    expect(placeAfterEdit(chunks, [20, 20])).toEqual({ current: -1, resume: 2 });
  });
});

describe("anchors", () => {
  const lines = (count: number) => doc(Array.from({ length: count }, (_, index) => `line ${index}`).join("\n"));
  const insert = (text: Text, line: number, insert: string) => ChangeSet.of({ from: text.line(line + 1).from, insert }, text.length);

  it("follows a change when lines are added above it", () => {
    const before = lines(60);
    const changes = insert(before, 10, "new\n");
    const anchor = mapAnchor(anchorOf(before, [50, 52]), changes, changes.apply(before));
    expect(anchorLines(changes.apply(before), anchor)).toEqual([51, 53]);
  });

  it("stays put when lines are added below it", () => {
    const before = lines(60);
    const changes = insert(before, 55, "new\n");
    const after = changes.apply(before);
    expect(anchorLines(after, mapAnchor(anchorOf(before, [50, 52]), changes, after))).toEqual([50, 52]);
  });

  it("keeps a gap past the last line at the end", () => {
    const before = lines(5);
    const changes = insert(before, 1, "new\n");
    const after = changes.apply(before);
    expect(anchorLines(after, mapAnchor(anchorOf(before, [5, 5]), changes, after))).toEqual([6, 6]);
  });
});
