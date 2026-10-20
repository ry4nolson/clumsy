export type WorkspaceTab = { id: string; kind: "start" | "document" };

export type Pane = { id: string; tabIds: string[]; activeTabId: string; size: number };

export type Workspace<T extends WorkspaceTab> = {
  tabs: Record<string, T>;
  panes: Pane[];
  focusedPaneId: string;
};

export const MAX_PANES = 4;

export function createWorkspace<T extends WorkspaceTab>(tab: T, paneId: string): Workspace<T> {
  return { tabs: { [tab.id]: tab }, panes: [{ id: paneId, tabIds: [tab.id], activeTabId: tab.id, size: 1 }], focusedPaneId: paneId };
}

export function focusedPane<T extends WorkspaceTab>(workspace: Workspace<T>) {
  return workspace.panes.find((pane) => pane.id === workspace.focusedPaneId) ?? workspace.panes[0];
}

export function focusedTab<T extends WorkspaceTab>(workspace: Workspace<T>) {
  return workspace.tabs[focusedPane(workspace).activeTabId];
}

export function paneOfTab<T extends WorkspaceTab>(workspace: Workspace<T>, tabId: string) {
  return workspace.panes.find((pane) => pane.tabIds.includes(tabId)) ?? null;
}

export function orderedTabs<T extends WorkspaceTab>(workspace: Workspace<T>) {
  return workspace.panes.flatMap((pane) => pane.tabIds.map((id) => workspace.tabs[id]));
}

function updatePane<T extends WorkspaceTab>(workspace: Workspace<T>, paneId: string, update: (pane: Pane) => Pane): Workspace<T> {
  return { ...workspace, panes: workspace.panes.map((pane) => (pane.id === paneId ? update(pane) : pane)) };
}

function insertId(ids: string[], id: string, index: number) {
  const next = ids.filter((existing) => existing !== id);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, id);
  return next;
}

export function addTab<T extends WorkspaceTab>(workspace: Workspace<T>, tab: T, paneId = workspace.focusedPaneId): Workspace<T> {
  const pane = workspace.panes.find((candidate) => candidate.id === paneId) ?? focusedPane(workspace);
  const index = pane.tabIds.indexOf(pane.activeTabId) + 1;
  const next = updatePane({ ...workspace, tabs: { ...workspace.tabs, [tab.id]: tab } }, pane.id, (current) => ({
    ...current,
    tabIds: insertId(current.tabIds, tab.id, index),
    activeTabId: tab.id,
  }));
  return { ...next, focusedPaneId: pane.id };
}

export function replaceTab<T extends WorkspaceTab>(workspace: Workspace<T>, tab: T): Workspace<T> {
  return workspace.tabs[tab.id] ? { ...workspace, tabs: { ...workspace.tabs, [tab.id]: tab } } : workspace;
}

export function selectTab<T extends WorkspaceTab>(workspace: Workspace<T>, tabId: string): Workspace<T> {
  const pane = paneOfTab(workspace, tabId);
  if (!pane) {
    return workspace;
  }
  return { ...updatePane(workspace, pane.id, (current) => ({ ...current, activeTabId: tabId })), focusedPaneId: pane.id };
}

export function focusPane<T extends WorkspaceTab>(workspace: Workspace<T>, paneId: string): Workspace<T> {
  return workspace.panes.some((pane) => pane.id === paneId) ? { ...workspace, focusedPaneId: paneId } : workspace;
}

export function focusAdjacentPane<T extends WorkspaceTab>(workspace: Workspace<T>, direction: 1 | -1): Workspace<T> {
  const index = workspace.panes.findIndex((pane) => pane.id === workspace.focusedPaneId);
  const target = workspace.panes[index + direction];
  return target ? { ...workspace, focusedPaneId: target.id } : workspace;
}

export function cycleTabs<T extends WorkspaceTab>(workspace: Workspace<T>, direction: 1 | -1): Workspace<T> {
  const pane = focusedPane(workspace);
  const index = pane.tabIds.indexOf(pane.activeTabId);
  const next = pane.tabIds[(index + direction + pane.tabIds.length) % pane.tabIds.length];
  return selectTab(workspace, next);
}

export function selectTabAt<T extends WorkspaceTab>(workspace: Workspace<T>, index: number): Workspace<T> {
  const id = focusedPane(workspace).tabIds[index];
  return id ? selectTab(workspace, id) : workspace;
}

function withoutPane<T extends WorkspaceTab>(workspace: Workspace<T>, paneId: string): Workspace<T> {
  const index = workspace.panes.findIndex((pane) => pane.id === paneId);
  const removed = workspace.panes[index];
  const panes = workspace.panes.filter((pane) => pane.id !== paneId);
  const neighbor = panes[Math.max(0, index - 1)];
  const resized = panes.map((pane) => (pane.id === neighbor.id ? { ...pane, size: pane.size + removed.size } : pane));
  return {
    ...workspace,
    panes: resized,
    focusedPaneId: workspace.focusedPaneId === paneId ? neighbor.id : workspace.focusedPaneId,
  };
}

function detachTab<T extends WorkspaceTab>(workspace: Workspace<T>, tabId: string): Workspace<T> {
  const pane = paneOfTab(workspace, tabId);
  if (!pane) {
    return workspace;
  }
  const index = pane.tabIds.indexOf(tabId);
  const tabIds = pane.tabIds.filter((id) => id !== tabId);
  const activeTabId = pane.activeTabId === tabId ? (tabIds[Math.min(index, tabIds.length - 1)] ?? "") : pane.activeTabId;
  return updatePane(workspace, pane.id, (current) => ({ ...current, tabIds, activeTabId }));
}

export function closeTab<T extends WorkspaceTab>(workspace: Workspace<T>, tabId: string, createStartTab: () => T): Workspace<T> {
  const pane = paneOfTab(workspace, tabId);
  if (!pane) {
    return workspace;
  }
  const { [tabId]: _closed, ...tabs } = workspace.tabs;
  let next = detachTab({ ...workspace, tabs }, tabId);
  const emptied = next.panes.find((candidate) => candidate.id === pane.id)!;
  if (!emptied.tabIds.length) {
    if (next.panes.length > 1) {
      next = withoutPane(next, pane.id);
    } else {
      const start = createStartTab();
      next = {
        ...next,
        tabs: { ...next.tabs, [start.id]: start },
        panes: [{ ...emptied, tabIds: [start.id], activeTabId: start.id }],
      };
    }
  }
  return next;
}

export function moveTab<T extends WorkspaceTab>(
  workspace: Workspace<T>,
  tabId: string,
  target: { paneId: string; index?: number } | { newPaneAfter: string; paneId: string },
): Workspace<T> {
  const source = paneOfTab(workspace, tabId);
  if (!source) {
    return workspace;
  }
  if ("newPaneAfter" in target) {
    if (workspace.panes.length >= MAX_PANES || (source.tabIds.length === 1 && source.id === target.newPaneAfter)) {
      return workspace;
    }
    let next = detachTab(workspace, tabId);
    const anchorIndex = next.panes.findIndex((pane) => pane.id === target.newPaneAfter);
    const anchor = next.panes[anchorIndex];
    const panes = [...next.panes];
    panes[anchorIndex] = { ...anchor, size: anchor.size / 2 };
    panes.splice(anchorIndex + 1, 0, { id: target.paneId, tabIds: [tabId], activeTabId: tabId, size: anchor.size / 2 });
    next = { ...next, panes };
    if (!next.panes.find((pane) => pane.id === source.id)!.tabIds.length) {
      next = withoutPane(next, source.id);
    }
    return { ...next, focusedPaneId: target.paneId };
  }
  if (!workspace.panes.some((pane) => pane.id === target.paneId)) {
    return workspace;
  }
  if (source.id === target.paneId) {
    const index = target.index ?? source.tabIds.length;
    const currentIndex = source.tabIds.indexOf(tabId);
    const adjusted = index > currentIndex ? index - 1 : index;
    return {
      ...updatePane(workspace, source.id, (pane) => ({ ...pane, tabIds: insertId(pane.tabIds, tabId, adjusted), activeTabId: tabId })),
      focusedPaneId: source.id,
    };
  }
  let next = detachTab(workspace, tabId);
  next = updatePane(next, target.paneId, (pane) => ({
    ...pane,
    tabIds: insertId(pane.tabIds, tabId, target.index ?? pane.tabIds.length),
    activeTabId: tabId,
  }));
  if (!next.panes.find((pane) => pane.id === source.id)!.tabIds.length) {
    next = withoutPane(next, source.id);
  }
  return { ...next, focusedPaneId: target.paneId };
}

export function moveTabToAdjacentPane<T extends WorkspaceTab>(workspace: Workspace<T>, direction: 1 | -1, newPaneId: string): Workspace<T> {
  const pane = focusedPane(workspace);
  const index = workspace.panes.indexOf(pane);
  const neighbor = workspace.panes[index + direction];
  if (neighbor) {
    return moveTab(workspace, pane.activeTabId, { paneId: neighbor.id });
  }
  if (direction === 1) {
    return moveTab(workspace, pane.activeTabId, { newPaneAfter: pane.id, paneId: newPaneId });
  }
  return workspace;
}

export function splitWithTab<T extends WorkspaceTab>(workspace: Workspace<T>, tab: T, paneId: string): Workspace<T> {
  if (workspace.panes.length >= MAX_PANES) {
    return workspace;
  }
  const anchor = focusedPane(workspace);
  const anchorIndex = workspace.panes.indexOf(anchor);
  const panes = [...workspace.panes];
  panes[anchorIndex] = { ...anchor, size: anchor.size / 2 };
  panes.splice(anchorIndex + 1, 0, { id: paneId, tabIds: [tab.id], activeTabId: tab.id, size: anchor.size / 2 });
  return { tabs: { ...workspace.tabs, [tab.id]: tab }, panes, focusedPaneId: paneId };
}

export function closeSplit<T extends WorkspaceTab>(workspace: Workspace<T>): Workspace<T> {
  if (workspace.panes.length < 2) {
    return workspace;
  }
  const [first, ...others] = workspace.panes;
  const extra = others.flatMap((pane) => pane.tabIds).filter((id) => workspace.tabs[id].kind === "document");
  const keep = new Set([...first.tabIds, ...extra]);
  const tabs = Object.fromEntries(Object.entries(workspace.tabs).filter(([id]) => keep.has(id))) as Record<string, T>;
  const focused = focusedPane(workspace).activeTabId;
  return {
    tabs,
    panes: [{ ...first, tabIds: [...first.tabIds, ...extra], activeTabId: keep.has(focused) ? focused : first.activeTabId, size: 1 }],
    focusedPaneId: first.id,
  };
}

export function resizePanes<T extends WorkspaceTab>(workspace: Workspace<T>, sizes: Record<string, number>): Workspace<T> {
  return { ...workspace, panes: workspace.panes.map((pane) => ({ ...pane, size: sizes[pane.id] ?? pane.size })) };
}
