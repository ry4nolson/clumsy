import { describe, expect, it, vi } from "vitest";
import { SET_SCALE_EVENT, defaultFormat, fullSize } from "../src/lib/measure";
import type { MarkupStore } from "../src/lib/markupStore";
import { createScaleQuestion } from "../src/lib/scaleQuestion";

function setup(scales: Array<object | null>, answer: boolean) {
  let ready = false;
  const store = {
    scalesReady: () => ready,
    scaleOf: (pageIndex: number) => scales[pageIndex] ?? null,
    loadScales: async () => {
      ready = true;
      return scales;
    },
    isStale: () => false,
  } as unknown as MarkupStore;
  const container = new EventTarget() as HTMLElement;
  const ask = vi.fn(async () => answer);
  const cancel = vi.fn();
  const opened: number[][] = [];
  container.addEventListener(SET_SCALE_EVENT, (event) => opened.push((event as CustomEvent<{ pages: number[] }>).detail.pages));
  const question = createScaleQuestion({ store, container, measuring: () => true, currentPage: () => 1, ask, cancel });
  return { question, ask, cancel, opened, store };
}

describe("asking for a scale", () => {
  it("holds clicks until scales load, then asks once for an unscaled page", async () => {
    const { question, ask, cancel, opened, store } = setup([{ scale: fullSize, format: defaultFormat }, null], true);
    expect(question.blocks(1)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    await store.loadScales();
    expect(question.blocks(0)).toBe(false);
    expect(question.blocks(1)).toBe(true);
    await Promise.resolve();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalled();
    expect(opened).toEqual([[1]]);
    expect(question.blocks(1)).toBe(false);
  });

  it("asks when the tool turns on over an unscaled page, and measures at full size when declined", async () => {
    const { question, ask, opened } = setup([null, null], false);
    question.check();
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(opened).toEqual([]);
    expect(question.blocks(0)).toBe(false);
  });
});
