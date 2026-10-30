import { describe, expect, it } from "vitest";
import { scrollForSlider, sliderFor } from "../src/lib/documentMap";
import { documentLayout, sourceViewport } from "../src/lib/markdownMap";
import type { LineBlock } from "../src/lib/markdownScroll";

describe("documentLayout", () => {
  it("draws the whole document when it fits and the slider over the viewport", () => {
    const layout = documentLayout(2000, 0.1);
    expect(sliderFor(layout, 600, { scrollTop: 500, clientHeight: 800, scrollHeight: 2000 })).toEqual({ offset: 0, top: 50, height: 80 });
  });

  it("scrolls the map content when the document is taller than the map", () => {
    const layout = documentLayout(20000, 0.1);
    const view = { scrollTop: 0, clientHeight: 800, scrollHeight: 20000 };
    expect(sliderFor(layout, 600, view)).toEqual({ offset: 0, top: 0, height: 80 });
    expect(sliderFor(layout, 600, { ...view, scrollTop: 19200 })).toEqual({ offset: 1400, top: 520, height: 80 });
    const middle = sliderFor(layout, 600, { ...view, scrollTop: 9600 });
    expect(middle.top).toBeCloseTo(260);
    expect(scrollForSlider(layout, 600, view, middle.top)).toBeCloseTo(9600, -1);
  });
});

describe("sourceViewport", () => {
  const blocks: LineBlock[] = [
    { start: 0, end: 10, top: 0, bottom: 400 },
    { start: 10, end: 20, top: 400, bottom: 600 },
  ];

  it("places the editor's visible lines on the rendered layout", () => {
    expect(sourceViewport(blocks, [5, 15], 600)).toEqual({ scrollTop: 200, clientHeight: 300, scrollHeight: 600 });
  });
});
