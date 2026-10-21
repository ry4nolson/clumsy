import { useCallback, useRef, useState } from "react";
import type { DocumentHandle, TabSnapshot } from "../components/DocumentTab";
import type { TabDropTarget } from "../components/PaneGrid";
import { confirmDiscard, documentWindowFor, recordRecentFile, showDocumentInWindow, showError, type PdfSource } from "../lib/platform";
import { rememberClosed, takeClosed, type ClosedTab } from "../lib/closedTabs";
import { createPaneId, createStartTab, createTabId, type DocTab, type OpenOptions, type Tab } from "../lib/tabs";
import * as ws from "../lib/workspace";

const tabWithPath = (workspace: ws.Workspace<Tab>, path: string) =>
  ws.orderedTabs(workspace).find((tab) => tab.kind === "document" && tab.path === path);

export function useWorkspace() {
  const [workspace, setWorkspace] = useState(() => ws.createWorkspace<Tab>(createStartTab(), createPaneId()));
  const [snapshots, setSnapshots] = useState<Record<string, TabSnapshot>>({});
  const handles = useRef(new Map<string, DocumentHandle>());
  const closedTabs = useRef<ClosedTab[]>([]);
  const workspaceRef = useRef(workspace);
  const snapshotsRef = useRef(snapshots);
  workspaceRef.current = workspace;
  snapshotsRef.current = snapshots;

  const activeHandle = useCallback(() => handles.current.get(ws.focusedTab(workspaceRef.current).id), []);

  const setHandle = useCallback((id: string, handle: DocumentHandle | null) => {
    if (handle) {
      handles.current.set(id, handle);
    } else {
      handles.current.delete(id);
    }
  }, []);

  const hasUnsavedChanges = useCallback(
    (tab: Tab | undefined) => tab?.kind === "document" && (tab.carriedChanges || !!handles.current.get(tab.id)?.viewer.commitEdits()),
    [],
  );

  const commit = useCallback((next: ws.Workspace<Tab>) => {
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);

  const update = useCallback((change: (current: ws.Workspace<Tab>) => ws.Workspace<Tab>) => commit(change(workspaceRef.current)), [commit]);

  const selectTab = useCallback((id: string) => update((current) => ws.selectTab(current, id)), [update]);

  const newTab = useCallback(
    (paneId?: string) => update((current) => ws.addTab(current, createStartTab(), paneId)),
    [update],
  );

  const dropTab = useCallback(
    (id: string, preferredActiveId?: string | null) => {
      handles.current.delete(id);
      setSnapshots((current) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      });
      update((current) => {
        const next = ws.closeTab(current, id, createStartTab);
        return preferredActiveId && next.tabs[preferredActiveId] ? ws.selectTab(next, preferredActiveId) : next;
      });
    },
    [update],
  );

  const closeTab = useCallback(
    async (id: string) => {
      const tab = workspaceRef.current.tabs[id];
      if (!tab) {
        return;
      }
      if (tab.kind === "document" && hasUnsavedChanges(tab) && !(await confirmDiscard([tab.name]))) {
        return;
      }
      if (tab.kind === "document" && tab.path) {
        const view = handles.current.get(id)?.viewer.viewState() ?? tab.view;
        closedTabs.current = rememberClosed(closedTabs.current, { path: tab.path, view });
      }
      dropTab(id);
    },
    [dropTab, hasUnsavedChanges],
  );

  const openSource = useCallback(
    async (source: PdfSource | Promise<PdfSource | null>, options: OpenOptions = {}) => {
      let resolved: PdfSource | null;
      try {
        resolved = await source;
      } catch (error) {
        await showError(`Could not open this PDF.\n\n${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      if (!resolved) {
        return;
      }
      const split = options.split && workspaceRef.current.panes.length < ws.MAX_PANES;
      if (resolved.path && !split && !options.allowDuplicate) {
        const existing = tabWithPath(workspaceRef.current, resolved.path);
        if (existing) {
          selectTab(existing.id);
          return;
        }
        const owner = await documentWindowFor(resolved.path);
        if (owner) {
          await showDocumentInWindow(owner, resolved.path);
          return;
        }
      }
      const current = workspaceRef.current;
      const focused = ws.focusedTab(current);
      const tab: DocTab = {
        id: createTabId(),
        kind: "document",
        source: resolved,
        name: resolved.name,
        path: resolved.path,
        replaces: !split && focused.kind === "start" ? focused.id : null,
        returnTo: focused.id,
        view: options.view,
        carriedChanges: !!options.carriedChanges,
        stamp: resolved.stamp ?? null,
      };
      commit(split ? ws.splitWithTab(current, tab, createPaneId()) : ws.addTab(current, tab));
    },
    [commit, selectTab],
  );

  const takeClosedTab = useCallback(() => {
    const openPaths = new Set(ws.orderedTabs(workspaceRef.current).flatMap((tab) => (tab.kind === "document" && tab.path ? [tab.path] : [])));
    const { tab, rest } = takeClosed(closedTabs.current, openPaths);
    closedTabs.current = rest;
    return tab;
  }, []);

  const showPath = useCallback(
    (path: string) => {
      const tab = tabWithPath(workspaceRef.current, path);
      if (tab) {
        selectTab(tab.id);
      }
    },
    [selectTab],
  );

  const handleLoaded = useCallback(
    (id: string) => {
      const tab = workspaceRef.current.tabs[id];
      if (tab?.kind !== "document") {
        return;
      }
      if (tab.path) {
        recordRecentFile(tab.path);
      }
      const replaced = tab.replaces;
      const pane = replaced ? ws.paneOfTab(workspaceRef.current, replaced) : null;
      if (replaced && pane && pane.activeTabId !== replaced) {
        update((current) => ws.closeTab(current, replaced, createStartTab));
      }
    },
    [update],
  );

  const handleFailed = useCallback(
    (id: string, error: unknown) => {
      const tab = workspaceRef.current.tabs[id];
      dropTab(id, tab?.kind === "document" ? tab.returnTo : null);
      if (error) {
        showError(`Could not open ${tab?.kind === "document" ? `“${tab.name}”` : "this PDF"}.\n\n${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [dropTab],
  );

  const handleSnapshot = useCallback((id: string, snapshot: TabSnapshot) => {
    setSnapshots((current) => ({ ...current, [id]: snapshot }));
  }, []);

  const moveTab = useCallback(
    (tabId: string, target: TabDropTarget) =>
      update((current) =>
        target.kind === "newPane"
          ? ws.moveTab(current, tabId, { newPaneAfter: target.afterPaneId, paneId: createPaneId() })
          : ws.moveTab(current, tabId, { paneId: target.paneId, index: target.index }),
      ),
    [update],
  );

  return {
    workspace,
    snapshots,
    workspaceRef,
    snapshotsRef,
    handles,
    activeHandle,
    setHandle,
    hasUnsavedChanges,
    commit,
    update,
    selectTab,
    newTab,
    dropTab,
    closeTab,
    openSource,
    takeClosedTab,
    showPath,
    handleLoaded,
    handleFailed,
    handleSnapshot,
    moveTab,
  };
}

export type WorkspaceApi = ReturnType<typeof useWorkspace>;
