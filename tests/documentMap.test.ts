import { describe, expect, it } from "vitest";
import { rangeRects, type TextItem } from "../src/lib/diffTokens";
import { MAP_GAP, MAP_PADDING, layoutMap, scrollForSlider, sliderFor, toMap, visibleRange, type PageBox } from "../src/lib/documentMap";

const boxes = (count: number, width = 600, height = 800, gap = 16, start = 16): PageBox[] =>
  Array.from({ length: count }, (_, index) => ({ top: start + index * (height + gap), width, height }));

const FULL = 96 - 2 * MAP_PADDING;

const viewerHeight = (pages: PageBox[]) => pages.at(-1)!.top + pages.at(-1)!.height + 32;

describe("layoutMap", () => {
  it("uses the full width when the document fits", () => {
    const pages = boxes(2);
    const layout = layoutMap(pages, viewerHeight(pages), { width: 96, height: 1000 });
    expect(layout.pages[0]).toMatchObject({ top: MAP_PADDING, left: MAP_PADDING, width: FULL });
    expect(layout.width).toBe(96);
    expect(layout.pages[0].height).toBeCloseTo((FULL * 4) / 3);
    expect(layout.pages[1].top).toBeCloseTo(MAP_PADDING + (FULL * 4) / 3 + MAP_GAP);
    expect(layout.height).toBeCloseTo(2 * MAP_PADDING + (2 * FULL * 4) / 3 + MAP_GAP);
  });

  it("shrinks pages so the whole document fits the height", () => {
    const pages = boxes(20);
    const layout = layoutMap(pages, viewerHeight(pages), { width: 96, height: 800 });
    expect(layout.height).toBeCloseTo(800);
    expect(layout.pages[0].width).toBeLessThan(FULL);
    expect(layout.pages[0].left).toBe(MAP_PADDING);
    expect(layout.width).toBeCloseTo(layout.pages[0].width + 2 * MAP_PADDING);
  });

  it("stops shrinking at the minimum width and overflows instead", () => {
    const pages = boxes(500);
    const layout = layoutMap(pages, viewerHeight(pages), { width: 96, height: 800 }, 18);
    expect(layout.pages[0].width).toBe(18);
    expect(layout.width).toBe(18 + 2 * MAP_PADDING);
    expect(layout.height).toBeGreaterThan(800);
  });

  it("keeps each page's proportions relative to the widest page", () => {
    const pages: PageBox[] = [
      { top: 16, width: 600, height: 800 },
      { top: 832, width: 800, height: 600 },
    ];
    const layout = layoutMap(pages, 1500, { width: 96, height: 1000 });
    expect(layout.pages[1].width).toBe(FULL);
    expect(layout.pages[0].width).toBeCloseTo(FULL * 0.75);
    expect(layout.pages[0].height).toBeCloseTo(FULL);
    expect(layout.pages[0].left).toBeCloseTo(MAP_PADDING + FULL * 0.125);
    expect(layout.pages[1].left).toBe(MAP_PADDING);
  });

  it("returns an empty layout with no pages or no room", () => {
    expect(layoutMap([], 0, { width: 96, height: 800 }).pages).toEqual([]);
    expect(layoutMap(boxes(1), 900, { width: 0, height: 800 }).pages).toEqual([]);
  });
});

describe("layoutMap with spreads", () => {
  const spread = (count: number): PageBox[] =>
    Array.from({ length: count }, (_, index) => ({ top: 16 + Math.floor(index / 2) * 816, left: 20 + (index % 2) * 610, width: 600, height: 800 }));

  it("puts pages that share a row side by side", () => {
    const pages = spread(4);
    const layout = layoutMap(pages, viewerHeight(pages), { width: 96, height: 1000 });
    const scale = FULL / 1210;
    expect(layout.pages[0]).toMatchObject({ top: MAP_PADDING, left: MAP_PADDING });
    expect(layout.pages[1].top).toBe(MAP_PADDING);
    expect(layout.pages[1].left).toBeCloseTo(MAP_PADDING + 610 * scale);
    expect(layout.pages[0].width).toBeCloseTo(600 * scale);
    expect(layout.pages[2].top).toBeCloseTo(MAP_PADDING + 800 * scale + MAP_GAP);
    expect(layout.viewerStops).toEqual([0, 16, 816, 832, 1632, viewerHeight(pages)]);
  });

  it("centers a short last row and a shorter page in its row", () => {
    const pages: PageBox[] = [...spread(2), { top: 832, left: 325, width: 600, height: 800 }, { top: 1700, left: 20, width: 600, height: 600 }, { top: 1648, left: 630, width: 600, height: 800 }];
    const layout = layoutMap(pages, 2500, { width: 96, height: 1000 });
    const scale = FULL / 1210;
    expect(layout.pages[2].left).toBeCloseTo(MAP_PADDING + 305 * scale);
    expect(layout.pages[3].top - layout.pages[4].top).toBeCloseTo(52 * scale);
  });

  it("applies the minimum width to each page, not the whole row", () => {
    const pages = spread(400);
    const layout = layoutMap(pages, viewerHeight(pages), { width: 96, height: 800 }, 18);
    expect(layout.pages[0].width).toBeCloseTo(18);
    expect(layout.width).toBeCloseTo((18 * 1210) / 600 + 2 * MAP_PADDING);
  });

  it("keeps one page per row without horizontal positions", () => {
    const pages = boxes(3).map(({ top, width, height }) => ({ top, width, height }));
    expect(layoutMap(pages, viewerHeight(pages), { width: 96, height: 1000 }).viewerStops).toHaveLength(8);
  });
});

describe("toMap", () => {
  const pages = boxes(3);
  const layout = layoutMap(pages, viewerHeight(pages), { width: 96, height: 1000 });

  it("maps page tops, page interiors, and gaps", () => {
    expect(toMap(layout, pages[1].top)).toBeCloseTo(layout.pages[1].top);
    expect(toMap(layout, pages[1].top + 400)).toBeCloseTo(layout.pages[1].top + layout.pages[1].height / 2);
    expect(toMap(layout, pages[0].top + 808)).toBeCloseTo(layout.pages[0].top + layout.pages[0].height + MAP_GAP / 2);
  });

  it("clamps outside the document", () => {
    expect(toMap(layout, -50)).toBe(0);
    expect(toMap(layout, 1e6)).toBe(layout.height);
  });

  it("doesn't depend on the viewer's zoom", () => {
    const zoomed = boxes(3, 1200, 1600);
    const other = layoutMap(zoomed, viewerHeight(zoomed), { width: 96, height: 1000 });
    expect(other.pages).toEqual(layout.pages);
    expect(toMap(other, zoomed[2].top + 800)).toBeCloseTo(toMap(layout, pages[2].top + 400));
  });
});

describe("slider", () => {
  const pages = boxes(3);
  const height = viewerHeight(pages);
  const layout = layoutMap(pages, height, { width: 96, height: 1000 });
  const view = (scrollTop: number) => ({ scrollTop, clientHeight: 900, scrollHeight: height });

  it("covers the visible part of the document", () => {
    const slider = sliderFor(layout, 1000, view(pages[1].top));
    expect(slider.offset).toBe(0);
    expect(slider.top).toBeCloseTo(layout.pages[1].top);
    expect(slider.height).toBeGreaterThan(layout.pages[1].height);
  });

  it("finds the scroll position that puts the slider at a point", () => {
    const target = sliderFor(layout, 1000, view(1234)).top;
    expect(Math.abs(scrollForSlider(layout, 1000, view(0), target) - 1234)).toBeLessThanOrEqual(1);
  });

  it("clamps the scroll position to the document", () => {
    expect(scrollForSlider(layout, 1000, view(0), -100)).toBe(0);
    expect(scrollForSlider(layout, 1000, view(0), 1e6)).toBe(height - 900);
  });
});

describe("overflowing map", () => {
  const pages = boxes(200);
  const height = viewerHeight(pages);
  const layout = layoutMap(pages, height, { width: 96, height: 600 });
  const view = (scrollTop: number) => ({ scrollTop, clientHeight: 900, scrollHeight: height });

  const offset = (scrollTop: number) => sliderFor(layout, 600, view(scrollTop)).offset;

  it("scrolls the map from its top to its bottom as the viewer scrolls", () => {
    expect(offset(0)).toBe(0);
    expect(offset(height - 900)).toBeCloseTo(layout.height - 600);
    const offsets = Array.from({ length: 50 }, (_, index) => offset(((height - 900) * index) / 49));
    offsets.slice(1).forEach((value, index) => expect(value).toBeGreaterThanOrEqual(offsets[index] - 0.5));
  });

  it("moves the slider steadily instead of sticking inside pages", () => {
    const top = (scrollTop: number) => sliderFor(layout, 600, view(scrollTop)).top;
    const page = pages[100];
    expect(top(page.top + 700) - top(page.top)).toBeGreaterThan(0.5);
  });

  it("keeps the slider on screen", () => {
    for (const scrollTop of [0, 5000, 80000, height - 900]) {
      const slider = sliderFor(layout, 600, view(scrollTop));
      expect(slider.top).toBeGreaterThanOrEqual(-0.5);
      expect(slider.top + slider.height).toBeLessThanOrEqual(600.5);
    }
  });

  it("round-trips a dragged slider back to a scroll position", () => {
    const target = sliderFor(layout, 600, view(60000)).top;
    expect(Math.abs(scrollForSlider(layout, 600, view(0), target) - 60000)).toBeLessThanOrEqual(2);
  });

  it("only reports pages near the visible part of the map", () => {
    const shift = offset(60000);
    const { first, last } = visibleRange(layout, shift, 600);
    expect(first).toBeGreaterThan(0);
    expect(last).toBeLessThan(199);
    expect(layout.pages[first].top + layout.pages[first].height).toBeGreaterThanOrEqual(shift - 300);
    expect(layout.pages[last].top).toBeLessThanOrEqual(shift + 900);
  });
});

describe("rangeRects", () => {
  const viewport = { transform: [1, 0, 0, -1, 0, 200], width: 100, height: 200 };
  const item = (str: string, x: number, y: number, extra: Partial<TextItem> = {}): TextItem => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, ...extra });

  it("finds the boxes for pdf.js find offsets, which skip line ends", () => {
    const page = { items: [item("hello", 0, 190, { hasEOL: true }), item("", 0, 0, { hasEOL: true }), item("world", 0, 170)], viewport };
    const [first, second, across] = rangeRects(page, 3, [[0, 5], [5, 5], [3, 4]]);
    expect(first).toHaveLength(1);
    expect(first[0].page).toBe(3);
    expect(first[0].width).toBeCloseTo(0.25);
    expect(second[0].y).toBeGreaterThan(first[0].y);
    expect(second[0].x).toBeCloseTo(0);
    expect(across).toHaveLength(2);
    expect(across[0].x).toBeCloseTo(0.15);
    expect(across[1].width).toBeCloseTo(0.1);
  });
});
