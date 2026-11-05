import { describe, expect, it } from "vitest";
import { shareBudget, trimHistory } from "../src/lib/pageHistory";

const version = (size: number, page = 0) => ({ bytes: new Uint8Array(size), page, count: 1 });

describe("trimHistory", () => {
  it("keeps the newest versions up to the count limit", () => {
    const versions = [0, 1, 2, 3].map((page) => version(1, page));
    expect(trimHistory(versions, 2).map((entry) => entry.page)).toEqual([2, 3]);
  });

  it("drops the oldest versions once they'd go over the byte budget", () => {
    const versions = [version(60, 0), version(30, 1), version(30, 2)];
    expect(trimHistory(versions, 20, 100).map((entry) => entry.page)).toEqual([1, 2]);
  });

  it("always keeps the newest version, even if it's over budget on its own", () => {
    expect(trimHistory([version(10, 0), version(500, 1)], 20, 100).map((entry) => entry.page)).toEqual([1]);
  });
});

describe("shareBudget", () => {
  const pages = (versions: Array<{ page: number }>) => versions.map((entry) => entry.page);

  it("leaves histories alone while the window is under budget", () => {
    const histories = [
      { undo: [version(30, 0), version(30, 1)], redo: [] },
      { undo: [version(30, 2)], redo: [version(10, 3)] },
    ];
    expect(shareBudget(histories, 100).map((history) => [pages(history.undo), pages(history.redo)])).toEqual([
      [[0, 1], []],
      [[2], [3]],
    ]);
  });

  it("drops the oldest versions of the tab holding the most first", () => {
    const histories = [
      { undo: [version(40, 0), version(40, 1), version(40, 2)], redo: [] },
      { undo: [version(30, 3), version(30, 4)], redo: [] },
    ];
    const [big, small] = shareBudget(histories, 100);
    expect(pages(big.undo)).toEqual([2]);
    expect(pages(small.undo)).toEqual([3, 4]);
  });

  it("drops the farthest redo once only the newest undo is left", () => {
    const histories = [{ undo: [version(50, 0)], redo: [version(50, 1), version(50, 2)] }];
    const [history] = shareBudget(histories, 120);
    expect(pages(history.undo)).toEqual([0]);
    expect(pages(history.redo)).toEqual([2]);
  });

  it("keeps every tab's newest undo even when those alone are over budget", () => {
    const histories = [
      { undo: [version(80, 0), version(80, 1)], redo: [] },
      { undo: [version(80, 2)], redo: [] },
    ];
    expect(shareBudget(histories, 100).map((history) => pages(history.undo))).toEqual([[1], [2]]);
  });

  it("doesn't change the histories it was given", () => {
    const undo = [version(80, 0), version(80, 1)];
    shareBudget([{ undo, redo: [] }], 100);
    expect(pages(undo)).toEqual([0, 1]);
  });
});
