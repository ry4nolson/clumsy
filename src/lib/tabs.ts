import type { ViewState } from "./documentWindows";
import type { PdfSource } from "./platform";

export type StartTab = { id: string; kind: "start" };

export type DocTab = {
  id: string;
  kind: "document";
  source: PdfSource;
  name: string;
  path: string | null;
  replaces: string | null;
  returnTo: string | null;
  view?: ViewState;
  carriedChanges: boolean;
};

export type Tab = StartTab | DocTab;

export type OpenOptions = { split?: boolean; view?: ViewState; carriedChanges?: boolean; allowDuplicate?: boolean };

let tabCounter = 0;
let paneCounter = 0;

export const createTabId = () => `tab-${++tabCounter}`;
export const createStartTab = (): StartTab => ({ id: createTabId(), kind: "start" });
export const createPaneId = () => `pane-${++paneCounter}`;

export const isModified = (tab: Tab | undefined, snapshots: Record<string, { modified: boolean } | undefined>) =>
  tab?.kind === "document" && (!!snapshots[tab.id]?.modified || tab.carriedChanges);
