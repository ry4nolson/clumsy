import { describe, expect, it } from "vitest";
import { changeWindow, describeWords, filteredChanges, summarizeChanges } from "../src/lib/changeSummary";
import type { Change, ChangeKind } from "../src/lib/comparison";

const change = (kind: ChangeKind, left: number, right: number): Change => ({
  kind,
  before: "",
  after: "",
  beforeText: "",
  afterText: "",
  words: { left, right },
  left: [],
  right: [],
});

const changes = [change("modified", 2, 3), change("added", 0, 5), change("removed", 4, 0), change("added", 0, 1)];

describe("summarizeChanges", () => {
  it("counts changes by kind and words on each side", () => {
    expect(summarizeChanges(changes)).toEqual({ added: 2, removed: 1, modified: 1, wordsAdded: 9, wordsRemoved: 6 });
  });

  it("is all zeros with no changes", () => {
    expect(summarizeChanges([])).toEqual({ added: 0, removed: 0, modified: 0, wordsAdded: 0, wordsRemoved: 0 });
  });
});

describe("filteredChanges", () => {
  it("keeps the original indices of matching changes", () => {
    expect(filteredChanges(changes, "all")).toEqual([0, 1, 2, 3]);
    expect(filteredChanges(changes, "added")).toEqual([1, 3]);
    expect(filteredChanges(changes, "removed")).toEqual([2]);
    expect(filteredChanges(changes, "modified")).toEqual([0]);
  });
});

describe("describeWords", () => {
  it("pluralizes word counts", () => {
    expect(describeWords(summarizeChanges(changes))).toBe("9 words added, 6 words removed");
    expect(describeWords(summarizeChanges([change("modified", 1, 1)]))).toBe("1 word added, 1 word removed");
  });
});

describe("changeWindow", () => {
  it("shows everything when the list is short", () => {
    expect(changeWindow(30, 12)).toEqual([0, 30]);
  });

  it("centers on the change in view and stays inside the list", () => {
    expect(changeWindow(10000, 5000, undefined, 400)).toEqual([4800, 5200]);
    expect(changeWindow(10000, 10, undefined, 400)).toEqual([0, 400]);
    expect(changeWindow(10000, 9990, undefined, 400)).toEqual([9600, 10000]);
  });

  it("grows by what Show earlier and Show later asked for", () => {
    expect(changeWindow(10000, 5000, { before: 400, after: 800 }, 400)).toEqual([4400, 6000]);
    expect(changeWindow(10000, 100, { before: 400, after: 0 }, 400)).toEqual([0, 400]);
  });
});
