import { useEffect } from "react";
import { canReload, looksComplete } from "../lib/externalChanges";
import { fileStamp, isDesktop, isMarkdownSource, readDocumentFromPath } from "../lib/platform";
import { isFileTab } from "../lib/tabs";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

const POLL_MS = 2000;
const SETTLE_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useExternalChanges({ workspaceRef, snapshotsRef, markdownHandles, viewStateOf, update }: WorkspaceApi) {
  useEffect(() => {
    if (!isDesktop) {
      return;
    }
    let checking = false;
    let disposed = false;

    const viewerState = (tabId: string) => {
      const tab = workspaceRef.current.tabs[tabId];
      if (tab?.kind !== "markdown") {
        return snapshotsRef.current[tabId];
      }
      const handle = markdownHandles.current.get(tabId);
      return handle ? { loaded: true, modified: handle.modified() } : undefined;
    };

    const reloadIfChanged = async (tabId: string) => {
      const tab = workspaceRef.current.tabs[tabId];
      if (!isFileTab(tab) || !tab.path) {
        return;
      }
      const stamp = await fileStamp(tab.path);
      if (!canReload(tab, viewerState(tabId), stamp)) {
        return;
      }
      await sleep(SETTLE_MS);
      if (disposed || (await fileStamp(tab.path)) !== stamp) {
        return;
      }
      const fresh = await readDocumentFromPath(tab.path);
      const latest = workspaceRef.current.tabs[tabId];
      if (disposed || !isFileTab(latest) || latest.kind !== tab.kind || latest.path !== tab.path) {
        return;
      }
      if (!isMarkdownSource(fresh) && !looksComplete(fresh.data)) {
        return;
      }
      if (!canReload(latest, viewerState(tabId), fresh.stamp ?? null)) {
        return;
      }
      const view = viewStateOf(latest);
      update((current) => {
        const target = current.tabs[tabId];
        if (!isFileTab(target) || target.path !== latest.path) {
          return current;
        }
        const stampOf = fresh.stamp ?? null;
        if (target.kind === "markdown" && isMarkdownSource(fresh)) {
          return ws.replaceTab(current, { ...target, source: fresh, stamp: stampOf, view: view && "mode" in view ? view : target.view });
        }
        if (target.kind === "document" && !isMarkdownSource(fresh)) {
          return ws.replaceTab(current, { ...target, source: fresh, stamp: stampOf, view: view && !("mode" in view) ? view : target.view });
        }
        return current;
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
  }, [markdownHandles, snapshotsRef, update, viewStateOf, workspaceRef]);
}
