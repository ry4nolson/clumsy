import { useCallback, useEffect, useRef } from "react";
import {
  discardTransfer,
  documentWindowAt,
  initialTransfer,
  onReceiveTab,
  openDocumentWindow,
  sendTabToWindow,
  stashTransferBytes,
  stashTransferPassword,
  transferProtection,
  transferSource,
  type TabTransfer,
} from "../lib/documentWindows";
import { encryptPdfOffThread } from "../lib/pageEditWorker";
import { closeWindow, showError } from "../lib/platform";
import { bytesForDisk } from "../lib/protection";
import { encodeText } from "../lib/textFile";
import { createStartTab } from "../lib/tabs";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

type Destination = { label: string } | { at?: { x: number; y: number } };

export async function captureTab(
  { workspaceRef, snapshotsRef, handles, markdownHandles, hasUnsavedChanges, viewStateOf }: WorkspaceApi,
  settled: (tabId: string) => Promise<void>,
  tabId: string,
  keepBytes: boolean,
): Promise<TabTransfer | null> {
  await settled(tabId);
  const tab = workspaceRef.current.tabs[tabId];
  if (!tab) {
    return null;
  }
  if (tab.kind === "start") {
    return { kind: "start" };
  }
  const format = tab.kind === "markdown" ? ("markdown" as const) : undefined;
  const modified = hasUnsavedChanges(tab);
  if (!keepBytes && !modified && tab.path) {
    return { kind: "document", format, name: tab.name, path: tab.path, stamp: tab.stamp, modified, view: viewStateOf(tab) ?? undefined };
  }
  if (tab.kind === "markdown") {
    const markdown = markdownHandles.current.get(tabId);
    if (!markdown) {
      return null;
    }
    return {
      kind: "document",
      format,
      transferId: await stashTransferBytes(encodeText(markdown.text(), tab.source.format)),
      name: tab.name,
      path: tab.path,
      stamp: tab.stamp,
      modified,
      view: markdown.viewState(),
    };
  }
  const handle = handles.current.get(tabId);
  if (!handle || !snapshotsRef.current[tabId]?.loaded) {
    return null;
  }
  const saved = await handle.viewer.save();
  if (!saved) {
    return null;
  }
  const bytes = keepBytes ? saved : await bytesForDisk(saved, tab.protection, encryptPdfOffThread);
  return {
    kind: "document",
    transferId: await stashTransferBytes(bytes),
    passwordId: keepBytes ? await stashTransferPassword(tab.protection) : undefined,
    name: tab.name,
    path: tab.path,
    stamp: tab.stamp,
    modified,
    view: handle.viewer.viewState() ?? undefined,
  };
}

export function useTabTransfer(api: WorkspaceApi, settled: (tabId: string) => Promise<void>) {
  const { workspaceRef, update, dropTab, openSource } = api;
  const receiveTab = useCallback(
    async (transfer: TabTransfer) => {
      if (transfer.kind === "start") {
        update((current) => ws.addTab(current, createStartTab()));
        return;
      }
      try {
        const protection = await transferProtection(transfer);
        await openSource(await transferSource(transfer), { view: transfer.view, carriedChanges: transfer.modified, allowDuplicate: true, protection });
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

  const prepareTransfer = async (tabId: string, allowLastTab: boolean) => {
    if (!allowLastTab && Object.keys(workspaceRef.current.tabs).length < 2) {
      return null;
    }
    return captureTab(api, settled, tabId, true);
  };

  const moveTabToWindow = async (tabId: string, destination: Destination) => {
    const merging = "label" in destination;
    const transfer = await prepareTransfer(tabId, merging);
    if (!transfer) {
      return;
    }
    const lastTab = Object.keys(workspaceRef.current.tabs).length === 1;
    try {
      if (merging) {
        await sendTabToWindow(destination.label, transfer);
      } else {
        await openDocumentWindow(transfer, destination.at);
      }
    } catch (error) {
      await discardTransfer(transfer);
      throw error;
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
