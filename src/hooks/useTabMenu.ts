import { useCallback, useRef } from "react";
import { revealLabel, type CommandId } from "../lib/commands";
import { canPrint, isMobile, showDocumentMenu } from "../lib/platform";
import { comparedTabId, tabMenu, tabsToRight } from "../lib/tabMenu";
import { isFileTab } from "../lib/tabs";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

type TabMenuActions = {
  onCommand: (id: CommandId) => void;
  onCompare: (leftId: string, rightId: string) => void;
};

export function useTabMenu({ workspaceRef, selectTab, closeTabs }: WorkspaceApi, actions: TabMenuActions) {
  const latest = useRef(actions);
  latest.current = actions;

  return useCallback(
    (tabId: string, point: { x: number; y: number }) => {
      if (isMobile) {
        return;
      }
      const current = workspaceRef.current;
      const tab = current.tabs[tabId];
      const pane = ws.paneOfTab(current, tabId);
      if (!tab || !pane) {
        return;
      }
      selectTab(tabId);
      const paneTabIds = pane.tabIds;
      const spec = tabMenu({
        tab: { id: tab.id, kind: tab.kind, path: tab.kind === "start" ? null : tab.path, protected: tab.kind === "document" && !!tab.protection },
        paneTabIds,
        comparable: ws.orderedTabs(current).flatMap((other) => (isFileTab(other) && other.kind === tab.kind ? [{ id: other.id, name: other.name }] : [])),
        revealLabel,
        canPrint,
        canSplit: current.panes.length < ws.MAX_PANES,
      });
      void showDocumentMenu(spec, point, (id) => {
        const compared = comparedTabId(id);
        if (compared) {
          latest.current.onCompare(tabId, compared);
        } else if (id === "closeOtherTabs") {
          void closeTabs(paneTabIds.filter((other) => other !== tabId));
        } else if (id === "closeTabsToRight") {
          void closeTabs(tabsToRight(paneTabIds, tabId));
        } else {
          latest.current.onCommand(id as CommandId);
        }
      });
    },
    [workspaceRef, selectTab, closeTabs],
  );
}
