import { useCallback, useRef } from "react";
import {
  CHANGED_ON_DISK,
  confirmOverwrite,
  confirmOwnerPassword,
  downloadMarkdown,
  downloadPdf,
  fileNameFromPath,
  isDesktop,
  NOT_WRITABLE,
  pickMarkdownSavePath,
  pickSavePath,
  recordRecentFile,
  showError,
  writeMarkdown,
  writePdf,
} from "../lib/platform";
import { encryptPdfOffThread, signaturesRemovedBy } from "../lib/pageEditWorker";
import { ANNOTATIONS_REWRITE_ACTION } from "../lib/signatureBytes";
import { confirmSignatureRemoval } from "../lib/signatureWarning";
import { bytesForDisk, hasEncryptEntry } from "../lib/protection";
import { isFileTab, isMarkdownView, type DocTab, type MarkdownDocTab } from "../lib/tabs";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

type Writer = (path: string, expectedStamp?: string | null) => Promise<string>;

async function writeTo(name: string, path: string, expectedStamp: string | null, write: Writer, pick: (name: string) => Promise<string | null>) {
  try {
    return { path, stamp: await write(path, expectedStamp) };
  } catch (error) {
    if (error === CHANGED_ON_DISK) {
      return (await confirmOverwrite(name)) ? { path, stamp: await write(path) } : null;
    }
    if (error !== NOT_WRITABLE) {
      throw error;
    }
    const picked = await pick(name);
    return picked ? { path: picked, stamp: await write(picked) } : null;
  }
}

export async function writePdfFor(tab: DocTab, bytes: Uint8Array, saveAs: boolean) {
  const chosen = saveAs || !tab.path ? await pickSavePath(tab.name) : tab.path;
  if (!chosen) {
    return null;
  }
  return writeTo(tab.name, chosen, chosen === tab.path ? tab.stamp : null, (path, expected) => writePdf(path, bytes, expected), pickSavePath);
}

export function useWriteAndReload({ workspaceRef, viewStateOf, update }: WorkspaceApi) {
  return useCallback(
    async (tabId: string, bytes: Uint8Array) => {
      const tab = workspaceRef.current.tabs[tabId];
      if (tab?.kind !== "document") {
        return false;
      }
      if (!isDesktop) {
        downloadPdf(tab.name, bytes);
        return true;
      }
      const written = await writePdfFor(tab, bytes, false);
      if (!written) {
        return false;
      }
      const { path, stamp } = written;
      const name = fileNameFromPath(path);
      update((current) => {
        const latest = current.tabs[tabId];
        if (latest?.kind !== "document") {
          return current;
        }
        const view = viewStateOf(latest);
        const source = { name, path, data: bytes.slice(), stamp };
        return ws.replaceTab(current, { ...latest, source, name, path, stamp, carriedChanges: false, protection: undefined, view: view && !isMarkdownView(view) ? view : latest.view });
      });
      recordRecentFile(path);
      return true;
    },
    [update, viewStateOf, workspaceRef],
  );
}

export function useSaveDocument({ workspaceRef, handles, markdownHandles, update }: WorkspaceApi, settled: (tabId: string) => Promise<void>) {
  const savingRef = useRef(new Set<string>());

  const saveMarkdown = async (tab: MarkdownDocTab, saveAs: boolean) => {
    const handle = markdownHandles.current.get(tab.id);
    if (!handle) {
      return;
    }
    const content = { text: handle.text(), format: tab.source.format };
    if (!isDesktop) {
      downloadMarkdown(tab.name, content);
      handle.markSaved(content.text);
      return;
    }
    const chosen = saveAs || !tab.path ? await pickMarkdownSavePath(tab.name) : tab.path;
    if (!chosen) {
      return;
    }
    const written = await writeTo(tab.name, chosen, chosen === tab.path ? tab.stamp : null, (path, expected) => writeMarkdown(path, content, expected), pickMarkdownSavePath);
    if (!written) {
      return;
    }
    const { path, stamp } = written;
    handle.markSaved(content.text);
    update((current) => {
      const latest = current.tabs[tab.id];
      return latest?.kind === "markdown" ? ws.replaceTab(current, { ...latest, name: fileNameFromPath(path), path, carriedChanges: false, stamp }) : current;
    });
    recordRecentFile(path);
  };

  return useCallback(async (saveAs: boolean, tabId?: string) => {
    const target = tabId ? workspaceRef.current.tabs[tabId] : ws.focusedTab(workspaceRef.current);
    if (!isFileTab(target) || savingRef.current.has(target.id)) {
      return;
    }
    if (target.kind === "markdown") {
      savingRef.current.add(target.id);
      try {
        await saveMarkdown(target, saveAs);
      } catch (error) {
        await showError(`Could not save.\n\n${error instanceof Error ? error.message : String(error)}`);
      } finally {
        savingRef.current.delete(target.id);
      }
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur();
    savingRef.current.add(target.id);
    try {
      await settled(target.id);
      const tab = workspaceRef.current.tabs[target.id];
      const handle = handles.current.get(target.id);
      if (tab?.kind !== "document" || !handle) {
        return;
      }
      await handle.viewer.editorUi?.scripting.runAction("WillSave");
      const saved = await handle.viewer.save();
      if (!saved) {
        return;
      }
      const removed = signaturesRemovedBy(saved);
      if (removed && !(await confirmSignatureRemoval(removed, ANNOTATIONS_REWRITE_ACTION))) {
        return;
      }
      if (tab.protection?.ownerPassword && hasEncryptEntry(saved) !== true) {
        if (!(await confirmOwnerPassword(tab.name))) {
          return;
        }
        const password = tab.protection.password;
        update((current) => {
          const latest = current.tabs[tab.id];
          return latest?.kind === "document" && latest.protection?.password === password ? ws.replaceTab(current, { ...latest, protection: { password } }) : current;
        });
      }
      const bytes = await bytesForDisk(saved, tab.protection, encryptPdfOffThread);
      if (!isDesktop) {
        downloadPdf(tab.name, bytes);
        handle.viewer.markSaved();
        return;
      }
      const written = await writePdfFor(tab, bytes, saveAs);
      if (!written) {
        return;
      }
      const { path, stamp } = written;
      const latestTab = workspaceRef.current.tabs[tab.id];
      const unchanged = latestTab?.kind === "document" && latestTab.source === tab.source;
      if (unchanged) {
        handle.viewer.markSaved();
      }
      update((current) => {
        const latest = current.tabs[tab.id];
        return latest?.kind === "document"
          ? ws.replaceTab(current, { ...latest, name: fileNameFromPath(path), path, carriedChanges: latest.carriedChanges && !unchanged, stamp })
          : current;
      });
      recordRecentFile(path);
      void handle.viewer.editorUi?.scripting.runAction("DidSave");
    } catch (error) {
      await showError(`Could not save.\n\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      savingRef.current.delete(target.id);
    }
  }, [handles, markdownHandles, settled, update, workspaceRef]);
}

export function useSaveAll({ workspaceRef, hasUnsavedChanges, selectTab }: WorkspaceApi, save: (saveAs: boolean, tabId?: string) => Promise<void>) {
  const savingAll = useRef(false);

  return useCallback(async () => {
    if (savingAll.current) {
      return;
    }
    savingAll.current = true;
    const focusedId = ws.focusedTab(workspaceRef.current).id;
    try {
      for (const tab of ws.orderedTabs(workspaceRef.current)) {
        if (isFileTab(tab) && hasUnsavedChanges(tab)) {
          if (!tab.path) {
            selectTab(tab.id);
          }
          await save(false, tab.id);
        }
      }
    } finally {
      savingAll.current = false;
      if (workspaceRef.current.tabs[focusedId]) {
        selectTab(focusedId);
      }
    }
  }, [hasUnsavedChanges, save, selectTab, workspaceRef]);
}
