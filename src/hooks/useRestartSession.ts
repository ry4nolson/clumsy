import { useEffect, useRef } from "react";
import {
  currentWindowBounds,
  initialRestoreIndex,
  isMainWindow,
  onCaptureSession,
  openDocumentWindow,
  reportSession,
  restoredWindows,
  restoreWindowBounds,
  takeRestoredWindow,
  transferSource,
  type SessionPane,
  type SessionWindow,
  type TabTransfer,
} from "../lib/documentWindows";
import { showError } from "../lib/platform";
import { buildWorkspace } from "../lib/session";
import { createFileTab, createPaneId, createStartTab, type Tab } from "../lib/tabs";
import { captureTab } from "./useTabTransfer";
import type { WorkspaceApi } from "./useWorkspace";

let restoreStarted = false;

async function reopen(transfer: TabTransfer, failed: string[]): Promise<Tab | null> {
  if (transfer.kind === "start") {
    return createStartTab();
  }
  try {
    return createFileTab(await transferSource(transfer), { view: transfer.view, carriedChanges: transfer.modified });
  } catch {
    failed.push(transfer.name);
    return null;
  }
}

export function useRestartSession(api: WorkspaceApi, settled: (tabId: string) => Promise<void>) {
  const apiRef = useRef(api);
  const settledRef = useRef(settled);
  apiRef.current = api;
  settledRef.current = settled;

  useEffect(() => {
    const capture = async (id: number) => {
      try {
        const current = apiRef.current.workspaceRef.current;
        const panes: SessionPane[] = [];
        for (const pane of current.panes) {
          const tabs: TabTransfer[] = [];
          for (const id of pane.tabIds) {
            const tab = await captureTab(apiRef.current, settledRef.current, id, false);
            if (!tab) {
              throw new Error("A tab couldn't be captured");
            }
            tabs.push(tab);
          }
          panes.push({ size: pane.size, active: pane.tabIds.indexOf(pane.activeTabId), tabs });
        }
        const focusedPane = current.panes.findIndex((pane) => pane.id === current.focusedPaneId);
        await reportSession(id, { panes, focusedPane, bounds: await currentWindowBounds() });
      } catch {
        await reportSession(id, null);
      }
    };
    const listening = onCaptureSession((id) => void capture(id));
    return () => {
      listening.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    if (restoreStarted) {
      return;
    }
    restoreStarted = true;
    const restore = async (session: SessionWindow | null) => {
      if (!session) {
        return;
      }
      const failed: string[] = [];
      const panes = await Promise.all(
        session.panes.map(async (pane) => ({
          size: pane.size,
          active: pane.active,
          tabs: await Promise.all(pane.tabs.map((transfer) => reopen(transfer, failed))),
        })),
      );
      apiRef.current.commit(buildWorkspace(panes, session.focusedPane, createPaneId, createStartTab));
      if (session.bounds) {
        await restoreWindowBounds(session.bounds, !!session.focused).catch(() => {});
      }
      if (failed.length) {
        await showError(`Couldn’t reopen ${failed.map((name) => `“${name}”`).join(", ")} after restarting.`);
      }
    };
    const start = async () => {
      if (!isMainWindow()) {
        const index = initialRestoreIndex();
        if (index !== null) {
          await restore(await takeRestoredWindow(index));
        }
        return;
      }
      const indices = await restoredWindows();
      for (const index of indices.filter((index) => index > 0)) {
        await openDocumentWindow(null, undefined, index);
      }
      if (indices.includes(0)) {
        await restore(await takeRestoredWindow(0));
      }
    };
    void start();
  }, []);
}
