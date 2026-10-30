export type NavStop = { page: number; left: number | null; top: number | null };
export type NavHistory = { back: NavStop[]; forward: NavStop[] };
export type NavDirection = "back" | "forward";

export const NAV_HISTORY_LIMIT = 50;

export const emptyNavHistory: NavHistory = { back: [], forward: [] };

const near = (a: number | null, b: number | null) => Math.round(a ?? 0) === Math.round(b ?? 0);

export const sameStop = (a: NavStop, b: NavStop) => a.page === b.page && near(a.left, b.left) && near(a.top, b.top);

function push(stops: NavStop[], stop: NavStop) {
  const last = stops.at(-1);
  return last && sameStop(last, stop) ? stops : [...stops, stop].slice(-NAV_HISTORY_LIMIT);
}

export function recordStop(history: NavHistory, from: NavStop): NavHistory {
  return { back: push(history.back, from), forward: [] };
}

export function stepNav(history: NavHistory, direction: NavDirection, current: NavStop | null): { history: NavHistory; target: NavStop } | null {
  const stops = history[direction];
  let index = stops.length - 1;
  while (index >= 0 && current && sameStop(stops[index], current)) {
    index--;
  }
  if (index < 0) {
    return null;
  }
  const remaining = stops.slice(0, index);
  const other = direction === "back" ? "forward" : "back";
  const pushed = current ? push(history[other], current) : history[other];
  return { target: stops[index], history: { [direction]: remaining, [other]: pushed } as NavHistory };
}

export function remapStops(history: NavHistory, pageAt: (page: number) => number): NavHistory {
  const remap = (stops: NavStop[]) => stops.map((stop) => ({ ...stop, page: pageAt(stop.page - 1) + 1 }));
  return { back: remap(history.back), forward: remap(history.forward) };
}

export function createNavigator(current: () => NavStop | null, go: (stop: NavStop) => void) {
  let history = emptyNavHistory;
  return {
    get: () => history,
    reset: (next: NavHistory = emptyNavHistory) => {
      history = next;
    },
    record: () => {
      const from = current();
      if (from) {
        history = recordStop(history, from);
      }
    },
    step: (direction: NavDirection) => {
      const step = stepNav(history, direction, current());
      if (step) {
        history = step.history;
        go(step.target);
      }
      return !!step;
    },
  };
}

export function clampStop(stop: NavStop, pagesCount: number): NavStop {
  const page = Math.min(Math.max(1, stop.page), Math.max(1, pagesCount));
  return page === stop.page ? stop : { page, left: null, top: null };
}
