import { useCallback, useEffect, useRef } from "react";
import {
  documentWindowAt,
  initialTransfer,
  onReceiveTab,
  openDocumentWindow,
  sendTabToWindow,
  stashTransferBytes,
  takeTransferBytes,
  type TabTransfer,
} from "../lib/documentWindows";
import { closeWindow, showError } from "../lib/platform";
import { createStartTab } from "../lib/tabs";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

type Destination = { label: string } | { at?: { x: number; y: number } };

export function useTabTransfer({ workspaceRef, snapshotsRef, handles, hasUnsavedChanges, update, dropTab, openSource }: WorkspaceApi) {
  const receiveTab = useCallback(
    async (transfer: TabTransfer) => {
      if (transfer.kind === "start") {
        update((current) => ws.addTab(current, createStartTab()));
        return;
      }
      try {
        const data = await takeTransferBytes(transfer.transferId);
        await openSource(
          { name: transfer.name, path: transfer.path, data },
          { view: transfer.view, carriedChanges: transfer.modified, allowDuplicate: true },
        );
      } catch (error) {
        await showError(`Could not move “${transfer.name}” here.\n\n${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [openSource, update],
  );

  const receiveTabRef = useRef(receiveTab);
  receiveTabRef.current = receiveTab;

  useEffect(() => {
    const transfer = initialTransfer();
    if (transfer) {
      receiveTabRef.current(transfer);
    }
    const listening = onReceiveTab((incoming) => receiveTabRef.current(incoming));
    return () => {
      listening.then((dispose) => dispose());
    };
  }, []);

  const prepareTransfer = async (tabId: string, allowLastTab: boolean): Promise<TabTransfer | null> => {
    const current = workspaceRef.current;
    const tab = current.tabs[tabId];
    if (!tab || (!allowLastTab && Object.keys(current.tabs).length < 2)) {
      return null;
    }
    if (tab.kind === "start") {
      return { kind: "start" };
    }
    const handle = handles.current.get(tabId);
    if (!handle || !snapshotsRef.current[tabId]?.loaded) {
      return null;
    }
    const modified = hasUnsavedChanges(tab);
    const bytes = await handle.viewer.save();
    if (!bytes) {
      return null;
    }
    return {
      kind: "document",
      transferId: await stashTransferBytes(bytes),
      name: tab.name,
      path: tab.path,
      modified,
      view: handle.viewer.viewState() ?? undefined,
    };
  };

  const moveTabToWindow = async (tabId: string, destination: Destination) => {
    const merging = "label" in destination;
    const transfer = await prepareTransfer(tabId, merging);
    if (!transfer) {
      return;
    }
    const lastTab = Object.keys(workspaceRef.current.tabs).length === 1;
    if (merging) {
      await sendTabToWindow(destination.label, transfer);
    } else {
      await openDocumentWindow(transfer, destination.at);
    }
    dropTab(tabId);
    if (lastTab) {
      await closeWindow();
    }
  };

  const tearOffTab = async (tabId: string, screenX: number, screenY: number) => {
    const target = await documentWindowAt(screenX, screenY);
    await moveTabToWindow(tabId, target ? { label: target } : { at: { x: screenX - 120, y: screenY - 20 } });
  };

  return { moveTabToWindow, tearOffTab };
}
