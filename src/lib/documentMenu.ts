import type { EditorTool } from "../hooks/useViewerTools";
import type { CommandId } from "./commands";
import { cleanContextTools, toolbarTools, toolCommand } from "./contextTools";
import type { MarkKind } from "./marks";
import { pageLabelOf } from "./pageLabels";

export type LocalMenuAction = "openLink" | "followLink" | "addCommentHere";
export type DocumentMenuId = CommandId | LocalMenuAction;

export type MenuEntry =
  | { kind: "item"; id: DocumentMenuId; label: string; enabled?: boolean; checked?: boolean }
  | { kind: "copy"; label: string }
  | { kind: "copyText"; label: string; text: string }
  | { kind: "separator" }
  | { kind: "submenu"; label: string; items: MenuEntry[] };

export type MenuSection = { header?: string; items: MenuEntry[] };

export type PaletteItem = { id: CommandId; label: string; symbol: string; checked: boolean };

export type DocumentMenuSpec = { palette: { label: string; items: PaletteItem[] } | null; sections: MenuSection[] };

export type MenuContext = {
  page: number | null;
  pagesCount: number;
  selectedPages: number[];
  pageLabels: string[] | null;
  textSelected: boolean;
  link: { kind: "external" | "internal"; href: string } | null;
  activeTool: EditorTool;
  mark: MarkKind | null;
  contextTools: unknown;
  canGoBack: boolean;
  canGoForward: boolean;
  canAddComment: boolean;
  canPrint: boolean;
  scaleValue: string;
};

const item = (id: DocumentMenuId, label: string, extra: { enabled?: boolean; checked?: boolean } = {}): MenuEntry => ({ kind: "item", id, label, ...extra });
const separator: MenuEntry = { kind: "separator" };

export function targetPages(page: number, selected: number[]) {
  return selected.includes(page) ? [...selected].sort((a, b) => a - b) : [page];
}

export function pageSection(pages: number[], pagesCount: number, pageLabels: string[] | null, canPrint: boolean): MenuSection {
  const count = pages.length;
  const plural = count > 1 ? `${count} Pages` : "Page";
  return {
    header: count > 1 ? `${count} Pages` : `Page ${pageLabelOf(pageLabels, pages[0] + 1)}`,
    items: [
      item("rotatePagesLeft", `Rotate ${plural} Left`),
      item("rotatePagesRight", `Rotate ${plural} Right`),
      separator,
      item("extractPages", `Extract ${plural} to New Tab`),
      item("exportSelectedPagesAsImages", count > 1 ? `Export ${plural} as Images…` : "Export Page as Image…"),
      ...(canPrint ? [item("printSelectedPages", `Print ${plural}…`)] : []),
      item("insertPages", "Insert Pages from File…"),
      item("pageLabels", "Page Labels…"),
      separator,
      item("deletePages", `Delete ${plural}`, { enabled: count < pagesCount }),
    ],
  };
}

export function toolPalette(activeTool: EditorTool, mark: MarkKind | null, contextTools: unknown): DocumentMenuSpec["palette"] {
  const chosen = new Set(cleanContextTools(contextTools));
  const items = toolbarTools
    .filter((info) => chosen.has(info.tool))
    .map((info) => ({ id: toolCommand(info.tool, mark), label: info.label, symbol: info.symbol, checked: info.tool === activeTool }));
  return items.length ? { label: "Tools", items } : null;
}

export function documentMenu(context: MenuContext): { spec: DocumentMenuSpec; pages: number[] } {
  const onPage = context.page !== null;
  const pages = onPage ? targetPages(context.page!, context.selectedPages) : [];
  const sections: MenuSection[] = [];
  if (onPage && context.textSelected) {
    sections.push({
      items: [
        { kind: "copy", label: "Copy" },
        item("highlightSelection", "Highlight Selected Text"),
        item("commentSelection", "Comment on Selected Text"),
        item("useSelectionForFind", "Use Selection for Find"),
      ],
    });
  }
  if (context.link?.kind === "external") {
    sections.push({ items: [item("openLink", "Open Link"), { kind: "copyText", label: "Copy Link", text: context.link.href }] });
  } else if (context.link?.kind === "internal") {
    sections.push({ items: [item("followLink", "Go to Destination")] });
  }
  if (onPage && context.canAddComment) {
    sections.push({ items: [item("addCommentHere", "Add Comment Here")] });
  }
  sections.push({
    items: [
      item("goBack", "Go Back", { enabled: context.canGoBack }),
      item("goForward", "Go Forward", { enabled: context.canGoForward }),
      {
        kind: "submenu",
        label: "Zoom",
        items: [
          item("zoomIn", "Zoom In"),
          item("zoomOut", "Zoom Out"),
          item("actualSize", "Actual Size"),
          item("fitWidth", "Fit Width", { checked: context.scaleValue === "page-width" }),
          item("fitPage", "Fit Page", { checked: context.scaleValue === "page-fit" }),
        ],
      },
    ],
  });
  if (onPage) {
    sections.push(pageSection(pages, context.pagesCount, context.pageLabels, context.canPrint));
  }
  return { spec: { palette: toolPalette(context.activeTool, context.mark, context.contextTools), sections }, pages };
}

export type FlatEntry = Exclude<MenuEntry, { kind: "submenu" }> | { kind: "header"; label: string } | { kind: "submenu"; label: string; items: FlatEntry[] };

export function flattenMenu(spec: DocumentMenuSpec): FlatEntry[] {
  const groups: FlatEntry[][] = [];
  if (spec.palette) {
    groups.push(spec.palette.items.map((tool) => ({ kind: "item", id: tool.id, label: tool.label, checked: tool.checked })));
  }
  for (const section of spec.sections) {
    if (section.items.length) {
      groups.push([...(section.header ? [{ kind: "header" as const, label: section.header }] : []), ...(section.items as FlatEntry[])]);
    }
  }
  return groups.flatMap((group, index) => (index ? [separator as FlatEntry, ...group] : group));
}
