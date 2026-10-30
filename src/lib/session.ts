import { createWorkspace, type Pane, type Workspace, type WorkspaceTab } from "./workspace";

export type RestoredPane<T> = { size: number; active: number; tabs: (T | null)[] };

export function buildWorkspace<T extends WorkspaceTab>(
  panes: RestoredPane<T>[],
  focusedPane: number,
  createPaneId: () => string,
  createStartTab: () => T,
): Workspace<T> {
  const tabs: Record<string, T> = {};
  const built: { index: number; pane: Pane }[] = [];
  panes.forEach((restored, index) => {
    const kept = restored.tabs.filter((tab): tab is T => !!tab);
    if (!kept.length) {
      return;
    }
    for (const tab of kept) {
      tabs[tab.id] = tab;
    }
    const preferred = restored.tabs.slice(0, restored.active + 1).reverse().find((tab): tab is T => !!tab) ?? kept[0];
    built.push({
      index,
      pane: { id: createPaneId(), tabIds: kept.map((tab) => tab.id), activeTabId: preferred.id, size: restored.size > 0 ? restored.size : 1 },
    });
  });
  if (!built.length) {
    return createWorkspace(createStartTab(), createPaneId());
  }
  const focused = built.find(({ index }) => index === focusedPane) ?? built[0];
  return { tabs, panes: built.map(({ pane }) => pane), focusedPaneId: focused.pane.id };
}
