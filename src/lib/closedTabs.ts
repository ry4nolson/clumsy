import type { ViewState } from "./documentWindows";

export type ClosedTab = { path: string; view?: ViewState };

export const CLOSED_TAB_LIMIT = 20;

export function rememberClosed(stack: ClosedTab[], closed: ClosedTab): ClosedTab[] {
  return [...stack.filter((entry) => entry.path !== closed.path), closed].slice(-CLOSED_TAB_LIMIT);
}

export function takeClosed(stack: ClosedTab[], openPaths: Set<string>): { tab: ClosedTab | null; rest: ClosedTab[] } {
  const rest = stack.filter((entry) => !openPaths.has(entry.path));
  const tab = rest.pop() ?? null;
  return { tab, rest };
}
