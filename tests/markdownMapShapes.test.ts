import { describe, expect, it } from "vitest";
import { firstBarFrom, onlyFindMarks, packBars } from "../src/lib/markdownMapShapes";

const text = { nodeType: 3, nodeName: "#text" } as unknown as Node;
const mark = { nodeType: 1, nodeName: "MARK", classList: { contains: (name: string) => name === "find-match" } } as unknown as Node;
const paragraph = { nodeType: 1, nodeName: "P", classList: { contains: () => false } } as unknown as Node;
const image = { nodeType: 1, nodeName: "IMG", classList: { contains: () => false } } as unknown as Node;

type Record = Parameters<typeof onlyFindMarks>[0][number];
const record = (type: MutationRecordType, target: Node, added: Node[] = [], removed: Node[] = []) =>
  ({ type, target, addedNodes: added, removedNodes: removed }) as unknown as Record;

describe("onlyFindMarks", () => {
  it("accepts marks being added, unwrapped, and recolored", () => {
    expect(onlyFindMarks([record("characterData", text), record("childList", paragraph, [mark, text], [text])])).toBe(true);
    expect(onlyFindMarks([record("childList", paragraph, [text], [mark]), record("childList", paragraph, [], [text])])).toBe(true);
    expect(onlyFindMarks([record("attributes", mark)])).toBe(true);
  });

  it("rejects anything that changes the rendered content", () => {
    expect(onlyFindMarks([record("childList", paragraph, [paragraph], [])])).toBe(false);
    expect(onlyFindMarks([record("attributes", image)])).toBe(false);
    expect(onlyFindMarks([record("attributes", mark), record("childList", paragraph, [], [paragraph])])).toBe(false);
  });
});

describe("packBars", () => {
  it("sorts line boxes by their top and keeps each one's color", () => {
    const bars = packBars([0, 30, 10, 12, 1, 5, 10, 20, 12, 0, 2, 20, 8, 12, 1], ["black", "gray"], 12);
    expect(Array.from(bars.geometry)).toEqual([5, 10, 20, 12, 2, 20, 8, 12, 0, 30, 10, 12]);
    expect(Array.from(bars.colorIndex)).toEqual([0, 1, 1]);
    expect(bars.tallest).toBe(12);
  });
});

describe("firstBarFrom", () => {
  it("finds the first line box at or below a position", () => {
    const { geometry } = packBars([0, 0, 1, 1, 0, 0, 10, 1, 1, 0, 0, 10, 1, 1, 0, 0, 25, 1, 1, 0], ["black"], 1);
    expect(firstBarFrom(geometry, -5)).toBe(0);
    expect(firstBarFrom(geometry, 10)).toBe(1);
    expect(firstBarFrom(geometry, 11)).toBe(3);
    expect(firstBarFrom(geometry, 26)).toBe(4);
  });
});
