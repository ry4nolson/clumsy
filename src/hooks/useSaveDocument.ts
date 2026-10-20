import { useCallback, useRef } from "react";
import {
  CHANGED_ON_DISK,
  confirmOverwrite,
  downloadPdf,
  fileNameFromPath,
  isDesktop,
  pickSavePath,
  recordRecentFile,
  showError,
  writePdf,
} from "../lib/platform";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

export function useSaveDocument({ workspaceRef, handles, update }: WorkspaceApi, settled: (tabId: string) => Promise<void>) {
  const savingRef = useRef(new Set<string>());

  return useCallback(async (saveAs: boolean) => {
    const focused = ws.focusedTab(workspaceRef.current);
    if (focused.kind !== "document" || savingRef.current.has(focused.id)) {
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur();
    savingRef.current.add(focused.id);
    try {
      await settled(focused.id);
      const tab = workspaceRef.current.tabs[focused.id];
      const handle = handles.current.get(focused.id);
      if (tab?.kind !== "document" || !handle) {
        return;
      }
      const bytes = await handle.viewer.save();
      if (!bytes) {
        return;
      }
      if (!isDesktop) {
        downloadPdf(tab.name, bytes);
        handle.viewer.markSaved();
        return;
      }
      const path = saveAs || !tab.path ? await pickSavePath(tab.name) : tab.path;
      if (!path) {
        return;
      }
      let stamp: string;
      try {
        stamp = await writePdf(path, bytes, path === tab.path ? tab.stamp : null);
      } catch (error) {
        if (error !== CHANGED_ON_DISK) {
          throw error;
        }
        if (!(await confirmOverwrite(tab.name))) {
          return;
        }
        stamp = await writePdf(path, bytes);
      }
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
    } catch (error) {
      await showError(`Could not save.\n\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      savingRef.current.delete(focused.id);
    }
  }, [handles, settled, update, workspaceRef]);
}
