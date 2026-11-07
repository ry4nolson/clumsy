import type { ViewState } from "./documentWindows";
import type { DocumentSource, MarkdownSource, PdfSource } from "./platform";
import type { Protection } from "./protection";

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
  protection?: Protection;
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

export type OpenOptions = { split?: boolean; view?: AnyViewState; carriedChanges?: boolean; allowDuplicate?: boolean; protection?: Protection };

let tabCounter = 0;
let paneCounter = 0;

export const createTabId = () => `tab-${++tabCounter}`;
export const createStartTab = (): StartTab => ({ id: createTabId(), kind: "start" });
export const createPaneId = () => `pane-${++paneCounter}`;

export function createFileTab(
  source: DocumentSource,
  options: Pick<OpenOptions, "view" | "carriedChanges" | "protection">,
  replaces: string | null = null,
  returnTo: string | null = null,
): FileTab {
  const common = {
    id: createTabId(),
    name: source.name,
    path: source.path,
    replaces,
    returnTo,
    carriedChanges: !!options.carriedChanges,
    stamp: source.stamp ?? null,
  };
  const { view } = options;
  return "text" in source
    ? { ...common, kind: "markdown", source, view: isMarkdownView(view) ? view : undefined }
    : { ...common, kind: "document", source, view: isMarkdownView(view) ? undefined : view, ...(options.protection ? { protection: options.protection } : {}) };
}

export const isFileTab = (tab: Tab | undefined): tab is FileTab => tab?.kind === "document" || tab?.kind === "markdown";

export const isMarkdownView = (view: AnyViewState | undefined): view is MarkdownViewState => !!view && "mode" in view;

export const isModified = (tab: Tab | undefined, snapshots: Record<string, { modified: boolean } | undefined>) =>
  isFileTab(tab) && (!!snapshots[tab.id]?.modified || tab.carriedChanges);

export type TabItem = {
  id: string;
  title: string;
  kind: "start" | "document" | "markdown";
  loading: boolean;
  modified: boolean;
  locked?: boolean;
  tooltip?: string;
};

export function tabItemFor(tab: Tab, snapshots: Record<string, { modified: boolean; loaded?: boolean } | undefined>): TabItem {
  if (tab.kind === "start") {
    return { id: tab.id, kind: "start", title: "Start", loading: false, modified: false };
  }
  const locked = tab.kind === "document" && !!tab.protection;
  const location = tab.path ?? tab.name;
  return {
    id: tab.id,
    kind: tab.kind,
    title: tab.name,
    tooltip: locked ? `${location}\nPassword protected` : location,
    loading: !snapshots[tab.id]?.loaded,
    modified: isModified(tab, snapshots),
    locked,
  };
}
