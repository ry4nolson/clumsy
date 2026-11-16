import { describe, expect, it } from "vitest";
import { toolCommand } from "../src/lib/contextTools";
import { resizedMarkup } from "../src/lib/markupDraft";
import { cleanMarkupParams } from "../src/lib/markupParams";
import { handlePoints } from "../src/lib/markupShapes";
import { defaultFormat, fullSize, scalePresets } from "../src/lib/measure";
import { buildMarkup, canFinish, finishedMarkup, measurable, vertexNear, withVertex, type MeasureBuild } from "../src/lib/measureBuild";
import { captionText } from "../src/lib/measureMarkup";

const style = { color: [1, 0, 0], fill: true, width: 2, opacity: 1 };
const eighth = scalePresets.find((scale) => scale.label === `1/8" = 1'-0"`)!;
const settings = { scale: eighth, format: defaultFormat };
const build = (kind: MeasureBuild["kind"], vertices: number[]): MeasureBuild => ({ id: "m1", pageIndex: 2, kind, vertices, rotation: 90, settings });

describe("building a measurement", () => {
  it("needs two points for lengths and paths and three for areas", () => {
    expect(canFinish(build("measure-length", [0, 0]))).toBe(false);
    expect(canFinish(build("measure-length", [0, 0, 10, 0]))).toBe(true);
    expect(canFinish(build("measure-path", [0, 0, 10, 0]))).toBe(true);
    expect(canFinish(build("measure-area", [0, 0, 10, 0]))).toBe(false);
    expect(canFinish(build("measure-area", [0, 0, 10, 0, 10, 10]))).toBe(true);
  });

  it("previews with the pointer as the next point and captions at the page scale", () => {
    const preview = buildMarkup(build("measure-length", [100, 100]), style, "D:1", [172, 100])!;
    expect(preview.line).toEqual([100, 100, 172, 100]);
    expect(preview.measure).toBe(settings);
    expect(preview.rotation).toBe(90);
    expect(preview.fill).toBeNull();
    expect(captionText(preview)).toBe(`8' 0"`);
    expect(buildMarkup(build("measure-path", [0, 0]), style, "D:1")).toBeNull();
  });

  it("fills areas only when the style asks, and never paths", () => {
    const area = buildMarkup(build("measure-area", [0, 0, 72, 0, 72, 72]), style, "D:1")!;
    expect(area.fill).toEqual([1, 0, 0]);
    expect(area.box).toEqual([0, 0, 72, 72]);
    expect(buildMarkup(build("measure-area", [0, 0, 72, 0, 72, 72]), { ...style, fill: false }, "D:1")!.fill).toBeNull();
    expect(buildMarkup(build("measure-path", [0, 0, 72, 0]), style, "D:1")!.fill).toBeNull();
  });

  it("drops measurements too small to mean anything", () => {
    expect(finishedMarkup(build("measure-length", [0, 0, 0.5, 0]), style, "D:1")).toBeNull();
    expect(finishedMarkup(build("measure-area", [0, 0, 10, 0, 20, 0]), style, "D:1")).toBeNull();
    expect(finishedMarkup(build("measure-path", [0, 0]), style, "D:1")).toBeNull();
    expect(finishedMarkup(build("measure-path", [0, 0, 10, 0]), style, "D:1")!.vertices).toEqual([0, 0, 10, 0]);
    expect(measurable({ kind: "measure-length", line: null, vertices: null })).toBe(false);
  });

  it("finds the vertex under the pointer", () => {
    expect(vertexNear([0, 0, 50, 50], [52, 49], 6)).toBe(1);
    expect(vertexNear([0, 0, 50, 50], [20, 20], 6)).toBe(-1);
    expect(withVertex([0, 0, 1, 1, 2, 2], 1, [9, 8])).toEqual([0, 0, 9, 8, 2, 2]);
  });
});

describe("editing a measurement's vertices", () => {
  const area = finishedMarkup({ ...build("measure-area", [0, 0, 100, 0, 100, 100]), settings: { scale: fullSize, format: defaultFormat } }, style, "D:1")!;

  it("gives every vertex a handle", () => {
    expect(handlePoints(area)).toEqual([
      ["v0", [0, 0]],
      ["v1", [100, 0]],
      ["v2", [100, 100]],
    ]);
  });

  it("moves one vertex and its box, snapping to its neighbor with Shift", () => {
    const moved = resizedMarkup(area, "v2", [120, 90], false)!;
    expect(moved.vertices).toEqual([0, 0, 100, 0, 120, 90]);
    expect(moved.box).toEqual([0, 0, 120, 90]);
    const snapped = resizedMarkup(area, "v2", [103, 90], true)!;
    expect(snapped.vertices![4]).toBeCloseTo(100, 9);
    expect(resizedMarkup(area, "v9", [1, 1], false)).toBeNull();
    expect(resizedMarkup(area, "nw", [1, 1], false)).toBeNull();
  });
});

describe("the measure tool's settings", () => {
  it("remembers the last measure tool and maps it to its command", () => {
    expect(cleanMarkupParams({ measure: "measure-area" }).measure).toBe("measure-area");
    expect(cleanMarkupParams({ measure: "measure-volume" }).measure).toBe("measure-length");
    expect(toolCommand("measure", null, "rectangle", "measure-path")).toBe("measurePath");
    expect(toolCommand("measure")).toBe("measureLength");
  });
});
