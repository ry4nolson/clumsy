import { describe, expect, it } from "vitest";
import { newMarkup } from "../src/lib/markup";
import { MARKUP_PARAMS_KEY, cleanMarkupParams, defaultMarkupParams, paramsOfMarkup, readMarkupParams, readRecentStamps, rememberStamp, styleOf } from "../src/lib/markupParams";
import { electricalStamps, isKnownStamp, reviewStamps, searchStamps, stampDesign, stampLabel } from "../src/lib/stampSymbols";

const memory = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
};

describe("markup params", () => {
  it("drops anything it doesn't recognize", () => {
    expect(cleanMarkupParams({ color: "red", width: 99, opacity: 0, shape: "hexagon", fill: "yes", textMode: "bold" })).toEqual(defaultMarkupParams);
    expect(cleanMarkupParams({ color: "#00FF00", width: 3, opacity: 0.5, shape: "cloud", fill: true, textMode: "underline" })).toMatchObject({ color: "#00FF00", width: 3, shape: "cloud", fill: true, textMode: "underline" });
  });

  it("reads what was stored and survives bad JSON", () => {
    const storage = memory();
    storage.setItem(MARKUP_PARAMS_KEY, JSON.stringify({ shape: "arrow" }));
    expect(readMarkupParams(storage).shape).toBe("arrow");
    storage.setItem(MARKUP_PARAMS_KEY, "{");
    expect(readMarkupParams(storage)).toEqual(defaultMarkupParams);
  });

  it("turns params into a style and a selected markup into params", () => {
    expect(styleOf({ ...defaultMarkupParams, color: "#ff0000" }).color).toEqual([1, 0, 0]);
    const markup = newMarkup({ id: "m", pageIndex: 0, kind: "ellipse", box: [0, 0, 1, 1] }, { color: [0, 0, 1], fill: true, width: 4, opacity: 0.5 }, "D:1");
    expect(paramsOfMarkup(defaultMarkupParams, markup)).toMatchObject({ color: "#0000ff", fill: true, width: 4, opacity: 0.5 });
  });

  it("keeps the eight most recent known stamps, newest first", () => {
    const storage = memory();
    for (const id of ["review:void", "nope", "check", "review:void", ...electricalStamps.slice(0, 8).map((entry) => entry.id)]) {
      rememberStamp(id, storage);
    }
    const recent = readRecentStamps(storage);
    expect(recent).toHaveLength(8);
    expect(recent[0]).toBe(electricalStamps[7].id);
    expect(recent).not.toContain("nope");
  });
});

describe("stamp symbols", () => {
  it("rejects ids that name prototype properties", () => {
    for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(isKnownStamp(id), id).toBe(false);
      expect(stampDesign(id), id).toBeNull();
    }
  });

  it("knows every stamp it lists and gives it a design", () => {
    for (const id of [...electricalStamps.map((entry) => entry.id), ...reviewStamps.map((entry) => entry.id), "circle-check-big"]) {
      expect(isKnownStamp(id), id).toBe(true);
      expect(stampDesign(id, "1/2/2026"), id).not.toBeNull();
    }
    expect(stampDesign("elec:not-a-thing")).toBeNull();
    expect(stampLabel("circle-check-big")).toBe("Circle Check Big");
  });

  it("keeps labels to WinAnsi", () => {
    const labels = [...electricalStamps.flatMap((entry) => entry.labels ?? []), ...reviewStamps.flatMap((entry) => stampDesign(entry.id, "11/07/2026")!.labels)];
    expect(labels.every((label) => /^[\x20-\x7e]+$/.test(label.text))).toBe(true);
  });

  it("puts the date under a review stamp's word", () => {
    const [word, date] = stampDesign("review:approved", "11/07/2026")!.labels;
    expect(word.text).toBe("APPROVED");
    expect(date.text).toBe("11/07/2026");
    expect(stampDesign("review:approved")!.labels).toHaveLength(1);
  });

  it("searches labels, ids, and keywords", () => {
    expect(searchStamps("gfci").electrical.map((entry) => entry.id)).toEqual(["elec:receptacle-gfci"]);
    expect(searchStamps("approved").review.map((entry) => entry.id)).toEqual(["review:approved"]);
    expect(searchStamps("thumbs").icons).toEqual(["thumbs-up", "thumbs-down"]);
    expect(searchStamps("").icons.length).toBeGreaterThan(40);
  });
});
