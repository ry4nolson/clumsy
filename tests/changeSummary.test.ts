import { describe, expect, it } from "vitest";
import { describeWords, filteredChanges, summarizeChanges } from "../src/lib/changeSummary";
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
