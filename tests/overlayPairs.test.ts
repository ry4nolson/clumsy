import { describe, expect, it } from "vitest";
import { choicesByLabel, choicesByNumber, overlayLabel, overlayName, pairsFrom, sheetLabels, unpairedCurrent, withChoice } from "../src/lib/overlayPairs";

describe("pairing sheets", () => {
  it("pairs by number and leaves the extras unpaired", () => {
    expect(choicesByNumber(3, 2)).toEqual([0, 1, null]);
    expect(pairsFrom(choicesByNumber(2, 4), 4)).toEqual([
      { previous: 0, current: 0 },
      { previous: 1, current: 1 },
      { previous: null, current: 2 },
      { previous: null, current: 3 },
    ]);
  });

  it("pairs by label across reordered, missing, and added sheets", () => {
    const choices = choicesByLabel(["A-101", "A-201", "A-301", "E-100"], ["a-201 ", "A-101", "E-100", "E-200"]);
    expect(choices).toEqual([1, 0, null, 2]);
    expect(pairsFrom(choices, 4)).toEqual([
      { previous: 0, current: 1 },
      { previous: 1, current: 0 },
      { previous: 3, current: 2 },
      { previous: 2, current: null },
      { previous: null, current: 3 },
    ]);
    expect(unpairedCurrent(choices, 4)).toEqual([3]);
  });

  it("pairs duplicate labels in order", () => {
    expect(choicesByLabel(["A", "A", "A"], ["A", "B", "A"])).toEqual([0, 2, null]);
  });

  it("moves a sheet another row had when it is chosen again", () => {
    expect(withChoice([0, 1, null], 2, 1)).toEqual([0, null, 1]);
    expect(withChoice([0, 1, null], 0, null)).toEqual([null, 1, null]);
  });

  it("ignores choices past the end of the current file", () => {
    expect(pairsFrom([5, 0], 1)).toEqual([
      { previous: 1, current: 0 },
      { previous: 0, current: null },
    ]);
  });
});

describe("naming", () => {
  it("labels each sheet by what it holds", () => {
    const labels = [["A-101", "A-201"], ["A-101", "A-900"]];
    expect(overlayLabel({ previous: 0, current: 0 }, labels[0], labels[1])).toBe("A-101 (overlay)");
    expect(overlayLabel({ previous: 1, current: null }, labels[0], labels[1])).toBe("A-201 (removed)");
    expect(overlayLabel({ previous: null, current: 1 }, labels[0], labels[1])).toBe("A-900 (added)");
  });

  it("falls back to page numbers and names the file", () => {
    expect(sheetLabels(null, 3)).toEqual(["1", "2", "3"]);
    expect(sheetLabels(["i", " "], 3)).toEqual(["i", "2", "3"]);
    expect(overlayName("A-201 rev 3.pdf", "A-201 rev 4.PDF")).toBe("A-201 rev 3 vs A-201 rev 4.pdf");
  });
});
