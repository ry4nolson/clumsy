import { useEffect } from "react";
import { canReload, looksComplete } from "../lib/externalChanges";
import { fileStamp, isDesktop, readPdfFromPath } from "../lib/platform";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

const POLL_MS = 2000;
const SETTLE_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useExternalChanges({ workspaceRef, snapshotsRef, handles, update }: WorkspaceApi) {
  useEffect(() => {
    if (!isDesktop) {
      return;
    }
    let checking = false;
    let disposed = false;

    const reloadIfChanged = async (tabId: string) => {
      const tab = workspaceRef.current.tabs[tabId];
      if (tab?.kind !== "document" || !tab.path) {
        return;
      }
      const stamp = await fileStamp(tab.path);
      if (!canReload(tab, snapshotsRef.current[tabId], stamp)) {
        return;
      }
      await sleep(SETTLE_MS);
      if (disposed || (await fileStamp(tab.path)) !== stamp) {
        return;
      }
      const fresh = await readPdfFromPath(tab.path);
      const latest = workspaceRef.current.tabs[tabId];
      const handle = handles.current.get(tabId);
      if (disposed || !handle || latest?.kind !== "document" || latest.path !== tab.path || !looksComplete(fresh.data)) {
        return;
      }
      if (!canReload(latest, snapshotsRef.current[tabId], fresh.stamp ?? null)) {
        return;
      }
      const view = handle.viewer.viewState() ?? latest.view;
      update((current) => {
        const target = current.tabs[tabId];
        return target?.kind === "document" && target.path === latest.path
          ? ws.replaceTab(current, { ...target, source: fresh, stamp: fresh.stamp ?? null, view })
          : current;
      });
    };

    const check = async () => {
      if (checking || document.visibilityState !== "visible") {
        return;
      }
      checking = true;
      try {
        for (const tab of ws.orderedTabs(workspaceRef.current)) {
          await reloadIfChanged(tab.id).catch(() => undefined);
        }
      } finally {
        checking = false;
      }
    };

    const timer = window.setInterval(check, POLL_MS);
    window.addEventListener("focus", check);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [handles, snapshotsRef, update, workspaceRef]);
}
