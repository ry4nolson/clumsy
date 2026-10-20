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

export function useSaveDocument({ workspaceRef, handles, update }: WorkspaceApi) {
  const savingRef = useRef(new Set<string>());

  return useCallback(async (saveAs: boolean) => {
    const tab = ws.focusedTab(workspaceRef.current);
    const handle = handles.current.get(tab.id);
    if (tab.kind !== "document" || !handle || savingRef.current.has(tab.id)) {
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur();
    savingRef.current.add(tab.id);
    try {
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
      handle.viewer.markSaved();
      update((current) => {
        const latest = current.tabs[tab.id];
        return latest?.kind === "document"
          ? ws.replaceTab(current, { ...latest, name: fileNameFromPath(path), path, carriedChanges: false, stamp })
          : current;
      });
      recordRecentFile(path);
    } catch (error) {
      await showError(`Could not save.\n\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      savingRef.current.delete(tab.id);
    }
  }, [handles, update, workspaceRef]);
}
