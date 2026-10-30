import { describe, expect, it } from "vitest";
import { NAV_HISTORY_LIMIT, clampStop, createNavigator, emptyNavHistory, remapStops, recordStop, stepNav, type NavStop } from "../src/lib/navHistory";

const stop = (page: number, top = 700, left = 0): NavStop => ({ page, left, top });

describe("recordStop", () => {
  it("pushes where the jump started and clears forward", () => {
    const history = recordStop({ back: [stop(1)], forward: [stop(9)] }, stop(3));
    expect(history).toEqual({ back: [stop(1), stop(3)], forward: [] });
  });

  it("doesn't record the same spot twice in a row", () => {
    const once = recordStop(emptyNavHistory, stop(2, 500.2));
    expect(recordStop(once, stop(2, 499.8)).back).toHaveLength(1);
  });

  it("keeps the newest stops up to the limit", () => {
    let history = emptyNavHistory;
    for (let page = 1; page <= NAV_HISTORY_LIMIT + 5; page++) {
      history = recordStop(history, stop(page));
    }
    expect(history.back).toHaveLength(NAV_HISTORY_LIMIT);
    expect(history.back[0].page).toBe(6);
    expect(history.back.at(-1)?.page).toBe(NAV_HISTORY_LIMIT + 5);
  });
});

describe("stepNav", () => {
  it("goes back to the last stop and remembers the current spot for forward", () => {
    const history = recordStop(recordStop(emptyNavHistory, stop(1)), stop(4));
    const back = stepNav(history, "back", stop(10));
    expect(back?.target).toEqual(stop(4));
    expect(back?.history).toEqual({ back: [stop(1)], forward: [stop(10)] });
    const forward = stepNav(back!.history, "forward", stop(4, 300));
    expect(forward?.target).toEqual(stop(10));
    expect(forward?.history).toEqual({ back: [stop(1), stop(4, 300)], forward: [] });
  });

  it("skips stops that are where the view already is", () => {
    const history = { back: [stop(2), stop(5)], forward: [] };
    expect(stepNav(history, "back", stop(5))?.target).toEqual(stop(2));
  });

  it("returns null when there is nowhere to go", () => {
    expect(stepNav(emptyNavHistory, "back", stop(1))).toBeNull();
    expect(stepNav({ back: [stop(3)], forward: [] }, "back", stop(3))).toBeNull();
    expect(stepNav({ back: [stop(3)], forward: [] }, "forward", stop(1))).toBeNull();
  });

  it("still steps without a current location", () => {
    const step = stepNav({ back: [stop(3)], forward: [stop(8)] }, "back", null);
    expect(step).toEqual({ target: stop(3), history: { back: [], forward: [stop(8)] } });
  });

  it("walks back through several jumps and forward again", () => {
    let history = emptyNavHistory;
    history = recordStop(history, stop(1));
    history = recordStop(history, stop(20));
    history = recordStop(history, stop(40));
    let at = stop(60);
    const visited: number[] = [];
    for (let step = stepNav(history, "back", at); step; step = stepNav(history, "back", at)) {
      history = step.history;
      at = step.target;
      visited.push(at.page);
    }
    expect(visited).toEqual([40, 20, 1]);
    const forward: number[] = [];
    for (let step = stepNav(history, "forward", at); step; step = stepNav(history, "forward", at)) {
      history = step.history;
      at = step.target;
      forward.push(at.page);
    }
    expect(forward).toEqual([20, 40, 60]);
  });
});

describe("createNavigator", () => {
  it("records the current spot and moves the view on back and forward", () => {
    let at: NavStop | null = stop(1);
    const visits: number[] = [];
    const navigator = createNavigator(
      () => at,
      (target) => {
        at = target;
        visits.push(target.page);
      },
    );
    navigator.record();
    at = stop(9);
    expect(navigator.step("back")).toBe(true);
    expect(navigator.step("back")).toBe(false);
    expect(navigator.step("forward")).toBe(true);
    expect(visits).toEqual([1, 9]);
    navigator.reset({ back: [stop(4)], forward: [] });
    expect(navigator.get().back).toEqual([stop(4)]);
  });

  it("skips recording before the view has a location", () => {
    const navigator = createNavigator(() => null, () => {});
    navigator.record();
    expect(navigator.get()).toEqual(emptyNavHistory);
  });
});

describe("remapStops", () => {
  it("moves every stop to its page's new position", () => {
    const pageAt = (page: number) => (page < 2 ? page : page - 1);
    expect(remapStops({ back: [stop(1), stop(5)], forward: [stop(9)] }, pageAt)).toEqual({ back: [stop(1), stop(4)], forward: [stop(8)] });
  });
});

describe("clampStop", () => {
  it("keeps stops inside the document and drops the offset when it moves", () => {
    expect(clampStop(stop(3), 10)).toEqual(stop(3));
    expect(clampStop(stop(12), 10)).toEqual({ page: 10, left: null, top: null });
    expect(clampStop(stop(0), 10)).toEqual({ page: 1, left: null, top: null });
  });
});
