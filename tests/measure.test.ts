import { describe, expect, it } from "vitest";
import {
  areaOf,
  formatArea,
  formatInches,
  formatLength,
  fullSize,
  insidePolygon,
  labelPoint,
  lengthOf,
  lineCaption,
  parseLength,
  pathCaption,
  pathLengthOf,
  sameScale,
  scaleFromCalibration,
  scalePresets,
  snapPoint,
  uprightAngle,
  type MeasureFormat,
} from "../src/lib/measure";

const preset = (label: string) => scalePresets.find((scale) => scale.label === label)!;
const ftIn = (precision = 16): MeasureFormat => ({ unit: "ft-in", precision });

describe("scale presets", () => {
  it("converts a point to real inches for every group", () => {
    expect(preset(`1/8" = 1'-0"`).inchesPerPoint).toBeCloseTo(96 / 72, 12);
    expect(preset(`1/4" = 1'-0"`).inchesPerPoint).toBeCloseTo(48 / 72, 12);
    expect(preset(`3/32" = 1'-0"`).inchesPerPoint).toBeCloseTo(128 / 72, 12);
    expect(preset(`1 1/2" = 1'-0"`).inchesPerPoint).toBeCloseTo(8 / 72, 12);
    expect(preset(`3" = 1'-0"`).inchesPerPoint).toBeCloseTo(4 / 72, 12);
    expect(preset(`1" = 10'`).inchesPerPoint).toBeCloseTo(120 / 72, 12);
    expect(preset(`1" = 100'`).inchesPerPoint).toBeCloseTo(1200 / 72, 12);
    expect(preset("1:100").inchesPerPoint).toBeCloseTo(100 / 72, 12);
    expect(preset("1:1").inchesPerPoint).toBe(fullSize.inchesPerPoint);
  });

  it("measures one paper inch as the preset's real length", () => {
    expect(formatLength(72, preset(`1/8" = 1'-0"`), ftIn())).toBe(`8' 0"`);
    expect(formatLength(72, preset(`3/16" = 1'-0"`), ftIn())).toBe(`5' 4"`);
    expect(formatLength(72, preset(`1" = 50'`), { unit: "ft", precision: 1 })).toBe("50.0 ft");
    expect(formatLength(72, preset("1:50"), { unit: "mm", precision: 0 })).toBe("1,270 mm");
  });

  it("lists every group in order", () => {
    expect([...new Set(scalePresets.map((scale) => scale.group))]).toEqual(["Architectural", "Engineering", "Metric"]);
    expect(scalePresets.filter((scale) => scale.group === "Architectural")).toHaveLength(11);
  });

  it("compares scales by factor, not label", () => {
    expect(sameScale(preset("1:1"), fullSize)).toBe(true);
    expect(sameScale(preset("1:100"), preset("1:50"))).toBe(false);
  });
});

describe("calibration", () => {
  it("round trips a known dimension", () => {
    const scale = scaleFromCalibration(300, parseLength("25'")!, ftIn())!;
    expect(formatLength(300, scale, ftIn())).toBe(`25' 0"`);
    expect(formatLength(150, scale, ftIn())).toBe(`12' 6"`);
    expect(scale.label).toBe(`1" = 6' 0"`);
  });

  it("labels metric calibrations as a ratio", () => {
    const scale = scaleFromCalibration(72, parseLength("2.54 m")!, { unit: "m", precision: 2 })!;
    expect(scale.label).toBe("1:100");
    expect(sameScale(scale, preset("1:100"))).toBe(true);
  });

  it("refuses empty lengths", () => {
    expect(scaleFromCalibration(0, 12, ftIn())).toBeNull();
    expect(scaleFromCalibration(10, 0, ftIn())).toBeNull();
  });
});

describe("parseLength", () => {
  it.each([
    ["25'", 300],
    [`25' 6"`, 306],
    [`25'6"`, 306],
    [`25'-6"`, 306],
    [`25' 6 1/2"`, 306.5],
    [`25' 6-1/2"`, 306.5],
    ["25 ft 6 in", 306],
    ["25 ft 6 1/2 in", 306.5],
    ["25 feet 6 inches", 306],
    ["25' 6", 306],
    [`1/2"`, 0.5],
    ["6.5 in", 6.5],
    ["25.5 ft", 306],
    ["7.62 m", 300],
    ["7620mm", 300],
    ["762 cm", 300],
    [`25’ 6”`, 306],
    ["25", 300],
  ])("reads %s", (text, inches) => {
    expect(parseLength(text)).toBeCloseTo(inches, 9);
  });

  it("reads a bare number in the format's unit", () => {
    expect(parseLength("7.62", "m")).toBeCloseTo(300, 9);
    expect(parseLength("12", "in")).toBe(12);
    expect(parseLength("12", "ft")).toBe(144);
  });

  it.each(["", "abc", "25 meh", "25 6", "5' 3' ", "1/0", "0", "-3'", "25' 6\" 1'", "ft"])("refuses %j", (text) => {
    expect(parseLength(text)).toBeNull();
  });
});

describe("formatting", () => {
  it("carries rounded inches into the next foot", () => {
    expect(formatInches(143 + 31 / 32, ftIn(16))).toBe(`12' 0"`);
    expect(formatInches(11.99, ftIn(4))).toBe(`1' 0"`);
  });

  it("reduces fractions and drops a zero inch before them", () => {
    expect(formatInches(306.5, ftIn(16))).toBe(`25' 6 1/2"`);
    expect(formatInches(306 + 3 / 16, ftIn(16))).toBe(`25' 6 3/16"`);
    expect(formatInches(306 + 3 / 16, ftIn(8))).toBe(`25' 6 1/4"`);
    expect(formatInches(60.25, ftIn(16))).toBe(`5' 1/4"`);
    expect(formatInches(0, ftIn(16))).toBe(`0' 0"`);
  });

  it("groups thousands", () => {
    expect(formatInches(12 * 1234 + 5, ftIn())).toBe(`1,234' 5"`);
    expect(formatInches(1234.5, { unit: "in", precision: 8 })).toBe(`1,234 1/2"`);
    expect(formatInches(parseLength("7620 mm")!, { unit: "mm", precision: 0 })).toBe("7,620 mm");
  });

  it("formats every unit at its precision", () => {
    const inches = 306.5;
    expect(formatInches(inches, { unit: "ft", precision: 2 })).toBe("25.54 ft");
    expect(formatInches(inches, { unit: "ft", precision: 0 })).toBe("26 ft");
    expect(formatInches(inches, { unit: "in", precision: 4 })).toBe(`306 1/2"`);
    expect(formatInches(inches, { unit: "m", precision: 2 })).toBe("7.79 m");
    expect(formatInches(inches, { unit: "mm", precision: 1 })).toBe("7,785.1 mm");
  });

  it("formats areas in square units", () => {
    const scale = preset(`1/8" = 1'-0"`);
    const square = 9 * 9;
    expect(formatArea(square, scale, ftIn())).toBe("1.00 sq ft");
    expect(formatArea(square * 1000, scale, { unit: "ft", precision: 1 })).toBe("1,000.0 sq ft");
    expect(formatArea(square, scale, { unit: "in", precision: 8 })).toBe("144.00 sq in");
    expect(formatArea(72 * 72, preset("1:100"), { unit: "m", precision: 2 })).toBe("6.45 m²");
    expect(formatArea(72 * 72, fullSize, { unit: "mm", precision: 0 })).toBe("645 mm²");
  });
});

describe("geometry", () => {
  it("measures lines and paths", () => {
    expect(lengthOf([0, 0, 3, 4])).toBe(5);
    expect(pathLengthOf([0, 0, 3, 4, 3, 10])).toBe(11);
    expect(pathLengthOf([1, 1])).toBe(0);
  });

  it("measures area the same in either winding", () => {
    const clockwise = [0, 0, 0, 10, 10, 10, 10, 0];
    const counter = [0, 0, 10, 0, 10, 10, 0, 10];
    expect(areaOf(clockwise)).toBe(100);
    expect(areaOf(counter)).toBe(100);
    expect(areaOf([0, 0, 10, 0])).toBe(0);
  });

  it("measures shapes that touch themselves at a vertex", () => {
    const twoSquares = [0, 0, 10, 0, 10, 10, 20, 10, 20, 20, 10, 20, 10, 10, 0, 10];
    expect(areaOf(twoSquares)).toBe(200);
  });

  it("measures concave shapes", () => {
    expect(areaOf([0, 0, 30, 0, 30, 30, 20, 30, 20, 10, 10, 10, 10, 30, 0, 30])).toBe(700);
  });
});

describe("captions", () => {
  it("keeps captions upright", () => {
    expect(lineCaption([0, 0, 10, 0]).angle).toBe(0);
    expect(lineCaption([10, 0, 0, 0]).angle).toBeCloseTo(0, 9);
    expect(Math.cos(lineCaption([10, 10, 0, 0]).angle)).toBeGreaterThan(0);
    expect(lineCaption([0, 10, 0, 0]).angle).toBeCloseTo(Math.PI / 2, 9);
    expect(lineCaption([0, 0, 0, 10]).angle).toBeCloseTo(Math.PI / 2, 9);
  });

  it("keeps captions upright on rotated pages", () => {
    const angle = uprightAngle(0, 90);
    const onScreen = angle - Math.PI / 2;
    expect(Math.cos(onScreen)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.sin(onScreen)).toBeGreaterThan(0);
    expect(uprightAngle(Math.PI, 180)).toBeCloseTo(Math.PI, 9);
    expect(uprightAngle(0, 180)).toBeCloseTo(Math.PI, 9);
  });

  it("puts a path caption at the middle of its longest segment", () => {
    const caption = pathCaption([0, 0, 10, 0, 10, 30]);
    expect(caption.x).toBe(10);
    expect(caption.y).toBe(15);
    expect(caption.angle).toBeCloseTo(Math.PI / 2, 9);
  });

  it("keeps a symmetric path's caption off its middle vertex", () => {
    const caption = pathCaption([100, 450, 250, 510, 400, 450]);
    expect(caption.x).toBe(175);
    expect(caption.y).toBe(480);
    expect(caption.angle).toBeCloseTo(Math.atan2(60, 150), 9);
  });

  it("places a degenerate path's caption at its first point", () => {
    expect(pathCaption([5, 6, 5, 6])).toEqual({ x: 5, y: 6, angle: 0 });
  });

  it("places area labels inside concave shapes", () => {
    const u = [0, 0, 30, 0, 30, 30, 20, 30, 20, 10, 10, 10, 10, 30, 0, 30];
    const [x, y] = labelPoint(u);
    expect(insidePolygon(x, y, u)).toBe(true);
    const l = [0, 0, 100, 0, 100, 10, 10, 10, 10, 100, 0, 100];
    const [lx, ly] = labelPoint(l);
    expect(insidePolygon(lx, ly, l)).toBe(true);
    expect(insidePolygon(...(labelPoint([0, 0, 10, 0, 10, 10, 0, 10]) as [number, number]), [0, 0, 10, 0, 10, 10, 0, 10])).toBe(true);
  });

  it("finds the widest spot of a simple shape", () => {
    const [x, y] = labelPoint([0, 0, 40, 0, 40, 20, 0, 20], 0.01);
    expect(y).toBeCloseTo(10, 1);
    expect(x).toBeGreaterThanOrEqual(10);
    expect(x).toBeLessThanOrEqual(30);
  });
});

describe("snapping", () => {
  it("snaps to 0, 45, and 90 degrees", () => {
    expect(snapPoint([0, 0], [10, 1]).map((value) => Math.round(value * 1e6) / 1e6)).toEqual([10, 0]);
    const diagonal = snapPoint([0, 0], [10, 9]);
    expect(diagonal[0]).toBeCloseTo(diagonal[1], 9);
    const vertical = snapPoint([5, 5], [6, -20]);
    expect(vertical[0]).toBeCloseTo(5, 9);
    expect(vertical[1]).toBeCloseTo(-20, 9);
  });
});
