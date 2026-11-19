import type { DocumentMenuId, DocumentMenuSpec, MenuEntry, MenuSection } from "./documentMenu";

export type TabMenuContext = {
  tab: { id: string; kind: "start" | "document" | "markdown"; path: string | null; protected: boolean };
  paneTabIds: string[];
  comparable: Array<{ id: string; name: string }>;
  revealLabel: string;
  canPrint: boolean;
  canSplit: boolean;
};

const comparePrefix = "compareWithTab:";

const item = (id: DocumentMenuId, label: string, enabled = true): MenuEntry => ({ kind: "item", id, label, enabled });

export const comparedTabId = (id: string) => (id.startsWith(comparePrefix) ? id.slice(comparePrefix.length) : null);

export function tabsToRight(paneTabIds: string[], tabId: string) {
  const index = paneTabIds.indexOf(tabId);
  return index < 0 ? [] : paneTabIds.slice(index + 1);
}

export function tabMenu(context: TabMenuContext): DocumentMenuSpec {
  const { tab, paneTabIds } = context;
  const isFile = tab.kind !== "start";
  const isPdf = tab.kind === "document";
  const sections: MenuSection[] = [
    {
      items: [
        item("closeTab", "Close Tab"),
        item("closeOtherTabs", "Close Other Tabs", paneTabIds.length > 1),
        item("closeTabsToRight", "Close Tabs to the Right", tabsToRight(paneTabIds, tab.id).length > 0),
      ],
    },
  ];
  if (isFile) {
    sections.push({ items: [item("save", "Save"), item("saveAs", "Save As…")] });
  }
  if (isFile && tab.path) {
    sections.push({
      items: [{ kind: "copyText", label: "Copy Path", text: tab.path }, item("revealInFinder", context.revealLabel)],
    });
  }
  const arrange = [item("splitRight", "Split Right", context.canSplit), item("moveTabToNewWindow", "Move Tab to New Window")];
  if (isFile) {
    const others = context.comparable.filter((other) => other.id !== tab.id).map((other) => item(`${comparePrefix}${other.id}`, other.name));
    arrange.unshift({
      kind: "submenu",
      label: "Compare With",
      items: [...others, ...(others.length ? [{ kind: "separator" } as MenuEntry] : []), item("compareWithFile", "File…")],
    });
  }
  sections.push({ items: arrange });
  if (isFile) {
    sections.push({
      items: [
        ...(context.canPrint ? [item("print", "Print…")] : []),
        ...(isPdf ? [item("exportPagesAsImages", "Export Pages as Images…"), item("compressPdf", "Compress…"), item("setPassword", tab.protected ? "Change Password…" : "Set Password…")] : []),
        ...(isPdf && tab.protected ? [item("removePassword", "Remove Password")] : []),
      ],
    });
  }
  return { palette: null, sections };
}
