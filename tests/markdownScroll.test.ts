import { describe, expect, it } from "vitest";
import { lineAtOffset, offsetForLine, offsetsForLines, type LineBlock } from "../src/lib/markdownScroll";

const blocks: LineBlock[] = [
  { start: 0, end: 1, top: 20, bottom: 60 },
  { start: 2, end: 4, top: 80, bottom: 120 },
  { start: 5, end: 25, top: 140, bottom: 540 },
  { start: 5, end: 6, top: 140, bottom: 160 },
  { start: 27, end: 28, top: 580, bottom: 600 },
];

describe("lineAtOffset", () => {
  it("maps a position inside a block proportionally", () => {
    expect(lineAtOffset(blocks, 20)).toBe(0);
    expect(lineAtOffset(blocks, 100)).toBe(3);
    expect(lineAtOffset(blocks, 340)).toBe(15);
  });

  it("prefers the innermost block", () => {
    expect(lineAtOffset(blocks, 150)).toBe(5.5);
  });

  it("interpolates across gaps between blocks", () => {
    expect(lineAtOffset(blocks, 70)).toBe(1.5);
    expect(lineAtOffset(blocks, 560)).toBe(26);
  });

  it("handles positions before the first and after the last block", () => {
    expect(lineAtOffset(blocks, 0)).toBe(0);
    expect(lineAtOffset(blocks, 10)).toBe(0);
    expect(lineAtOffset(blocks, 900)).toBe(28);
    expect(lineAtOffset([], 100)).toBe(0);
  });
});

describe("offsetForLine", () => {
  it("is the inverse of lineAtOffset inside blocks", () => {
    for (const offset of [20, 45, 80, 100, 150, 200, 339, 590]) {
      expect(offsetForLine(blocks, lineAtOffset(blocks, offset))).toBeCloseTo(offset);
    }
  });

  it("interpolates lines that fall between blocks", () => {
    expect(offsetForLine(blocks, 1.5)).toBe(70);
    expect(offsetForLine(blocks, 26)).toBe(560);
  });

  it("handles lines outside every block", () => {
    expect(offsetForLine(blocks, 40)).toBe(600);
    expect(offsetForLine([], 3)).toBe(0);
  });
});

describe("offsetsForLines", () => {
  it("matches offsetForLine for every line, with nested blocks and gaps", () => {
    let seed = 7;
    const random = (limit: number) => (seed = (seed * 16807) % 2147483647) % limit;
    for (let round = 0; round < 20; round++) {
      const blocks: LineBlock[] = [];
      let line = random(3);
      let top = random(20);
      while (blocks.length < 40) {
        const size = 1 + random(4);
        const height = 10 + random(40);
        blocks.push({ start: line, end: line + size, top, bottom: top + height });
        if (random(3) === 0) {
          blocks.push({ start: line + random(size), end: line + size, top: top + 2, bottom: top + height - 2 });
        }
        if (random(5) === 0) {
          blocks.push({ start: line, end: line + size, top, bottom: top + height });
        }
        line += size + random(3);
        top += height + random(30);
      }
      const lines = Array.from({ length: line + 3 }, (_, index) => index);
      const offsets = offsetsForLines(blocks, lines);
      for (const query of lines) {
        expect(offsets.get(query)).toBe(offsetForLine(blocks, query));
      }
    }
  });
});
