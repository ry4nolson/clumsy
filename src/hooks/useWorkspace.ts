import { useCallback, useRef, useState } from "react";
import type { DocumentHandle, TabSnapshot } from "../components/DocumentTab";
import type { MarkdownHandle, MarkdownSnapshot } from "../components/MarkdownTab";
import type { TabDropTarget } from "../components/PaneGrid";
import {
  confirmDiscard,
  documentWindowFor,
  recordRecentFile,
  showDocumentInWindow,
  showError,
  type DocumentSource,
} from "../lib/platform";
import { rememberClosed, takeClosed, type ClosedTab } from "../lib/closedTabs";
import { createFileTab, createPaneId, createStartTab, isFileTab, type FileTab, type OpenOptions, type Tab } from "../lib/tabs";
import * as ws from "../lib/workspace";

const tabWithPath = (workspace: ws.Workspace<Tab>, path: string) =>
  ws.orderedTabs(workspace).find((tab) => isFileTab(tab) && tab.path === path);

export function useWorkspace() {
  const [workspace, setWorkspace] = useState(() => ws.createWorkspace<Tab>(createStartTab(), createPaneId()));
  const [snapshots, setSnapshots] = useState<Record<string, TabSnapshot>>({});
  const [markdownSnapshots, setMarkdownSnapshots] = useState<Record<string, MarkdownSnapshot>>({});
  const handles = useRef(new Map<string, DocumentHandle>());
  const markdownHandles = useRef(new Map<string, MarkdownHandle>());
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

  const activeMarkdown = useCallback(() => markdownHandles.current.get(ws.focusedTab(workspaceRef.current).id), []);

  const setMarkdownHandle = useCallback((id: string, handle: MarkdownHandle | null) => {
    if (handle) {
      markdownHandles.current.set(id, handle);
    } else {
      markdownHandles.current.delete(id);
    }
  }, []);

  const hasUnsavedChanges = useCallback((tab: Tab | undefined) => {
    if (tab?.kind === "markdown") {
      return tab.carriedChanges || !!markdownHandles.current.get(tab.id)?.modified();
    }
    return tab?.kind === "document" && (tab.carriedChanges || !!handles.current.get(tab.id)?.viewer.commitEdits());
  }, []);

  const viewStateOf = useCallback(
    (tab: FileTab) => (tab.kind === "markdown" ? markdownHandles.current.get(tab.id)?.viewState() : handles.current.get(tab.id)?.viewer.viewState()) ?? tab.view,
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
      markdownHandles.current.delete(id);
      const without = <T,>(current: Record<string, T>) => {
        const { [id]: _removed, ...rest } = current;
        return rest;
      };
      setSnapshots(without);
      setMarkdownSnapshots(without);
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
      if (isFileTab(tab) && hasUnsavedChanges(tab) && !(await confirmDiscard([tab.name]))) {
        return;
      }
      if (isFileTab(tab) && tab.path) {
        closedTabs.current = rememberClosed(closedTabs.current, { path: tab.path, view: viewStateOf(tab) ?? undefined });
      }
      dropTab(id);
    },
    [dropTab, hasUnsavedChanges, viewStateOf],
  );

  const openSource = useCallback(
    async (source: DocumentSource | Promise<DocumentSource | null>, options: OpenOptions = {}): Promise<string | null> => {
      let resolved: DocumentSource | null;
      try {
        resolved = await source;
      } catch (error) {
        await showError(`Could not open this file.\n\n${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
      if (!resolved) {
        return null;
      }
      const split = options.split && workspaceRef.current.panes.length < ws.MAX_PANES;
      if (resolved.path && !split && !options.allowDuplicate) {
        const existing = tabWithPath(workspaceRef.current, resolved.path);
        if (existing) {
          selectTab(existing.id);
          return existing.id;
        }
        const owner = await documentWindowFor(resolved.path);
        if (owner) {
          await showDocumentInWindow(owner, resolved.path);
          return null;
        }
      }
      const current = workspaceRef.current;
      const focused = ws.focusedTab(current);
      const tab = createFileTab(resolved, options, !split && focused.kind === "start" ? focused.id : null, focused.id);
      commit(split ? ws.splitWithTab(current, tab, createPaneId()) : ws.addTab(current, tab));
      return tab.id;
    },
    [commit, selectTab],
  );

  const takeClosedTab = useCallback(() => {
    const openPaths = new Set(ws.orderedTabs(workspaceRef.current).flatMap((tab) => (isFileTab(tab) && tab.path ? [tab.path] : [])));
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
      if (!isFileTab(tab)) {
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
      dropTab(id, isFileTab(tab) ? tab.returnTo : null);
      if (error) {
        showError(`Could not open ${isFileTab(tab) ? `“${tab.name}”` : "this file"}.\n\n${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [dropTab],
  );

  const handleSnapshot = useCallback((id: string, snapshot: TabSnapshot) => {
    setSnapshots((current) => ({ ...current, [id]: snapshot }));
  }, []);

  const handleMarkdownSnapshot = useCallback((id: string, snapshot: MarkdownSnapshot) => {
    setMarkdownSnapshots((current) => ({ ...current, [id]: snapshot }));
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
    markdownSnapshots,
    handles,
    markdownHandles,
    activeHandle,
    activeMarkdown,
    setHandle,
    setMarkdownHandle,
    viewStateOf,
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
    handleMarkdownSnapshot,
    moveTab,
  };
}

export type WorkspaceApi = ReturnType<typeof useWorkspace>;
