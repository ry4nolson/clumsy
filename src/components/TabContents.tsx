import type { CompareView } from "../hooks/useComparison";
import type { Tab } from "../lib/tabs";
import type * as ws from "../lib/workspace";
import { DocumentTab, type DocumentHandle, type DocumentTabProps } from "./DocumentTab";
import { MarkdownTab, type MarkdownHandle, type MarkdownSnapshot } from "./MarkdownTab";
import { Welcome, type WelcomeProps } from "./Welcome";

type SharedDocumentProps = Omit<DocumentTabProps, "id" | "paneId" | "column" | "source" | "initialView" | "initialSelection" | "active" | "caretBrowsing" | "compare">;

type SharedMarkdownProps = {
  sidebarOpen: boolean;
  documentMap: boolean;
  onSnapshot: (id: string, snapshot: MarkdownSnapshot) => void;
  onLoaded: (id: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenFile: (document: string, href: string) => void;
};

type TabContentsProps = {
  workspace: ws.Workspace<Tab>;
  welcome: Omit<WelcomeProps, "loading">;
  documentProps: SharedDocumentProps;
  markdownProps: SharedMarkdownProps;
  caretBrowsing: boolean;
  compareFor: (tabId: string) => CompareView | null;
  setHandle: (id: string, handle: DocumentHandle | null) => void;
  setMarkdownHandle: (id: string, handle: MarkdownHandle | null) => void;
};

export function TabContents({ workspace, welcome, documentProps, markdownProps, caretBrowsing, compareFor, setHandle, setMarkdownHandle }: TabContentsProps) {
  return workspace.panes.flatMap((pane, index) =>
    pane.tabIds.map((tabId) => {
      const tab = workspace.tabs[tabId];
      const active = tabId === pane.activeTabId;
      const column = index * 2 + 1;
      if (tab.kind === "start") {
        return (
          <div key={tab.id} className={`document-tab${active ? "" : " inactive"}`} inert={!active} data-pane-id={pane.id} style={{ gridColumn: column }}>
            <div className="empty-state">
              <Welcome loading={false} {...welcome} />
            </div>
          </div>
        );
      }
      if (tab.kind === "markdown") {
        return (
          <MarkdownTab
            key={tab.id}
            ref={(handle) => setMarkdownHandle(tab.id, handle)}
            id={tab.id}
            paneId={pane.id}
            column={column}
            source={tab.source}
            path={tab.path}
            initialView={tab.view}
            active={active}
            {...markdownProps}
          />
        );
      }
      return (
        <DocumentTab
          key={tab.id}
          ref={(handle) => setHandle(tab.id, handle)}
          id={tab.id}
          paneId={pane.id}
          column={column}
          source={tab.source}
          initialView={tab.view}
          initialSelection={tab.selection}
          active={active}
          caretBrowsing={caretBrowsing && pane.id === workspace.focusedPaneId}
          compare={compareFor(tab.id)}
          {...documentProps}
        />
      );
    }),
  );
}
