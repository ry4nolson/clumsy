export type ScrollModeName = "vertical" | "horizontal" | "wrapped" | "page";
export type SpreadModeName = "none" | "odd" | "even";
export type ViewModes = { scrollMode: ScrollModeName; spreadMode: SpreadModeName };
export type DocumentSidebar = "outline" | "thumbnails";
export type DocumentView = Partial<ViewModes> & { sidebar?: DocumentSidebar };

export const scrollModes: ScrollModeName[] = ["vertical", "horizontal", "wrapped", "page"];
export const spreadModes: SpreadModeName[] = ["none", "odd", "even"];

export const defaultViewModes: ViewModes = { scrollMode: "vertical", spreadMode: "none" };

const pageLayouts: Record<string, ViewModes> = {
  SinglePage: { scrollMode: "page", spreadMode: "none" },
  OneColumn: { scrollMode: "vertical", spreadMode: "none" },
  TwoColumnLeft: { scrollMode: "vertical", spreadMode: "odd" },
  TwoColumnRight: { scrollMode: "vertical", spreadMode: "even" },
  TwoPageLeft: { scrollMode: "page", spreadMode: "odd" },
  TwoPageRight: { scrollMode: "page", spreadMode: "even" },
};

const pageModes: Record<string, DocumentSidebar> = {
  UseOutlines: "outline",
  UseThumbs: "thumbnails",
};

export function documentView(pageMode: string | null | undefined, pageLayout: string | null | undefined): DocumentView {
  const modes = pageLayout ? pageLayouts[pageLayout] : undefined;
  const sidebar = pageMode ? pageModes[pageMode] : undefined;
  return { ...modes, ...(sidebar ? { sidebar } : {}) };
}

export function isScrollMode(value: unknown): value is ScrollModeName {
  return scrollModes.includes(value as ScrollModeName);
}

export function isSpreadMode(value: unknown): value is SpreadModeName {
  return spreadModes.includes(value as SpreadModeName);
}

export const scrollsVertically = (mode: ScrollModeName) => mode === "vertical" || mode === "wrapped";
