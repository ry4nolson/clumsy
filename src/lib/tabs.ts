import type { ViewState } from "./documentWindows";
import type { MarkdownSource, PdfSource } from "./platform";

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
  selection?: number[];
  carriedChanges: boolean;
  stamp: string | null;
};

export type MarkdownMode = "rendered" | "source";

export type MarkdownViewState = { mode: MarkdownMode; line: number; zoom: number };

export type MarkdownDocTab = {
  id: string;
  kind: "markdown";
  source: MarkdownSource;
  name: string;
  path: string | null;
  replaces: string | null;
  returnTo: string | null;
  view?: MarkdownViewState;
  carriedChanges: boolean;
  stamp: string | null;
};

export type FileTab = DocTab | MarkdownDocTab;

export type Tab = StartTab | FileTab;

export type AnyViewState = ViewState | MarkdownViewState;

export type OpenOptions = { split?: boolean; view?: AnyViewState; carriedChanges?: boolean; allowDuplicate?: boolean };

let tabCounter = 0;
let paneCounter = 0;

export const createTabId = () => `tab-${++tabCounter}`;
export const createStartTab = (): StartTab => ({ id: createTabId(), kind: "start" });
export const createPaneId = () => `pane-${++paneCounter}`;

export const isFileTab = (tab: Tab | undefined): tab is FileTab => tab?.kind === "document" || tab?.kind === "markdown";

export const isMarkdownView = (view: AnyViewState | undefined): view is MarkdownViewState => !!view && "mode" in view;

export const isModified = (tab: Tab | undefined, snapshots: Record<string, { modified: boolean } | undefined>) =>
  isFileTab(tab) && (!!snapshots[tab.id]?.modified || tab.carriedChanges);
