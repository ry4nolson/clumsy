import { describe, expect, it } from "vitest";
import { defaultFormat, formatLength, fullSize, scalePresets, type MeasureFormat } from "../src/lib/measure";
import { CUSTOM, FULL_SIZE, changesScale, customScale, fittedFormat, precisionOptions, presetKey, scaleForKey, scaleKey, startingScale } from "../src/lib/scaleChoice";

const quarter = scalePresets.find((scale) => scale.label === `1/4" = 1'-0"`)!;
const metric: MeasureFormat = { unit: "m", precision: 2 };

describe("scale choices", () => {
  it("round trips presets and full size through their keys", () => {
    scalePresets.forEach((preset, index) => {
      expect(scaleKey(preset)).toBe(presetKey(index));
      expect(scaleForKey(presetKey(index))).toEqual({ label: preset.label, inchesPerPoint: preset.inchesPerPoint });
    });
    expect(scaleKey(fullSize)).toBe(FULL_SIZE);
    expect(scaleForKey(FULL_SIZE)).toEqual(fullSize);
    expect(scaleKey({ label: "odd", inchesPerPoint: 0.123 })).toBe(CUSTOM);
    expect(scaleForKey(CUSTOM)).toBeNull();
    expect(scaleForKey("preset-999")).toBeNull();
  });

  it("builds a custom scale from paper and real lengths", () => {
    const scale = customScale(` 1/4" `, "1'", "ft-in")!;
    expect(scale.label).toBe(`1/4" = 1'`);
    expect(scale.inchesPerPoint).toBeCloseTo(quarter.inchesPerPoint, 12);
    expect(formatLength(72, customScale("1", "20", "ft")!, { unit: "ft", precision: 0 })).toBe("20 ft");
    expect(formatLength(72, customScale("10 mm", "1 m", "m")!, metric)).toBe("2.54 m");
  });

  it("refuses custom scales it can't read", () => {
    expect(customScale("", "1'", "ft-in")).toBeNull();
    expect(customScale("1/4\"", "junk", "ft-in")).toBeNull();
    expect(customScale("0", "1'", "ft-in")).toBeNull();
  });

  it("offers fractions for feet and inches and decimals otherwise", () => {
    expect(precisionOptions("ft-in").map(([, name]) => name)).toEqual(['1/16"', '1/8"', '1/4"']);
    expect(precisionOptions("m").map(([, name]) => name)).toEqual(["0", "0.0", "0.00"]);
    expect(fittedFormat("in", 8)).toEqual({ unit: "in", precision: 8 });
    expect(fittedFormat("m", 16)).toEqual({ unit: "m", precision: 2 });
    expect(fittedFormat("ft-in", 2)).toEqual({ unit: "ft-in", precision: 16 });
  });

  it("starts from the target page's scale, then any page's, then full size", () => {
    const set = { scale: quarter, format: defaultFormat };
    const other = { scale: fullSize, format: metric };
    expect(startingScale([null, set, other], [1])).toBe(set);
    expect(startingScale([null, set, other], [0])).toBe(set);
    expect(startingScale([null, null], [0])).toEqual({ scale: fullSize, format: defaultFormat });
  });

  it("knows when applying would change nothing", () => {
    const set = { scale: quarter, format: defaultFormat };
    expect(changesScale([set, set], [0, 1], set)).toBe(false);
    expect(changesScale([set, null], [0, 1], set)).toBe(true);
    expect(changesScale([set], [0], { scale: quarter, format: metric })).toBe(true);
    expect(changesScale([set], [0], { scale: { ...quarter, label: "renamed" }, format: defaultFormat })).toBe(true);
    expect(changesScale([null], [0], null)).toBe(false);
    expect(changesScale([set], [0], null)).toBe(true);
  });
});
