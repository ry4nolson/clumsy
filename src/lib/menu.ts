import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { acceleratorFor, commandById, documentAvailable, type Command, type CommandId, type MenuName } from "./commands";
import type { RecentEntry } from "./recent";
import type { ScrollModeName, SpreadModeName, ViewModes } from "./viewModes";

type Predefined = "Services" | "Hide" | "HideOthers" | "ShowAll" | "Cut" | "Copy" | "Paste" | "SelectAll" | "Fullscreen" | "Minimize" | "Maximize" | "BringAllToFront";
type Slot = CommandId | "-" | "recent" | { predefined: Predefined };

const RECENT_LIMIT = 10;

export const menuLayout: Array<[MenuName, Slot[]]> = [
  [
    "Clumsy",
    [
      "about",
      "checkUpdates",
      "makeDefault",
      "makeDefaultMarkdown",
      "-",
      { predefined: "Services" },
      "-",
      { predefined: "Hide" },
      { predefined: "HideOthers" },
      { predefined: "ShowAll" },
      "-",
      "quit",
    ],
  ],
  [
    "File",
    [
      "newTab",
      "newWindow",
      "open",
      "recent",
      "newPdfFromImages",
      "combineFiles",
      "compareWithFile",
      "-",
      "exportPagesAsImages",
      "exportComparison",
      "-",
      "closeTab",
      "closeWindow",
      "reopenClosedTab",
      "-",
      "save",
      "saveAs",
      "saveAll",
      "-",
      "revealInFinder",
    ],
  ],
  [
    "Edit",
    [
      "undo",
      "redo",
      "-",
      { predefined: "Cut" },
      { predefined: "Copy" },
      { predefined: "Paste" },
      { predefined: "SelectAll" },
      "-",
      "find",
      "findNext",
      "findPrevious",
      "useSelectionForFind",
    ],
  ],
  [
    "View",
    [
      "commandPalette",
      "-",
      "toggleSidebar",
      "showPages",
      "showOutline",
      "toggleDocumentMap",
      "toggleMarkdownSource",
      "-",
      "splitRight",
      "closeSplit",
      "-",
      "compareSplitPanes",
      "swapComparison",
      "toggleLinkedScroll",
      "endComparison",
      "-",
      "actualSize",
      "zoomIn",
      "zoomOut",
      "fitWidth",
      "fitPage",
      "-",
      "rotateLeft",
      "rotateRight",
      "-",
      "scrollVertical",
      "scrollHorizontal",
      "scrollWrapped",
      "scrollPage",
      "-",
      "spreadNone",
      "spreadOdd",
      "spreadEven",
      "-",
      "toggleCaretBrowsing",
      "toggleDarkPages",
      "toggleInvertImages",
      "-",
      { predefined: "Fullscreen" },
    ],
  ],
  ["Go", ["previousPage", "nextPage", "firstPage", "lastPage", "-", "goBack", "goForward", "-", "quickOpen", "goToPage", "-", "nextChange", "previousChange"]],
  ["Pages", ["insertPages", "-", "rotatePagesLeft", "rotatePagesRight", "-", "deletePages", "extractPages", "exportSelectedPagesAsImages", "-", "pageLabels"]],
  ["Tools", ["toolSelect", "toolHand", "toolHighlight", "toolText", "toolDraw", "-", "addImage", "sign"]],
  [
    "Window",
    [
      { predefined: "Minimize" },
      { predefined: "Maximize" },
      "-",
      "nextTab",
      "previousTab",
      "-",
      "focusLeftPane",
      "focusRightPane",
      "moveTabLeft",
      "moveTabRight",
      "moveTabToNewWindow",
      "-",
      { predefined: "BringAllToFront" },
    ],
  ],
  ["Help", ["keyboardShortcuts", "whatsNew", "-", "openGitHub", "reportIssue"]],
];

const scrollModeCommands: Record<ScrollModeName, CommandId> = {
  vertical: "scrollVertical",
  horizontal: "scrollHorizontal",
  wrapped: "scrollWrapped",
  page: "scrollPage",
};

const spreadModeCommands: Record<SpreadModeName, CommandId> = { none: "spreadNone", odd: "spreadOdd", even: "spreadEven" };

const radioCommands = new Set<CommandId>([...Object.values(scrollModeCommands), ...Object.values(spreadModeCommands)]);

const checkCommands = new Set<CommandId>([
  "toggleDocumentMap",
  "toggleMarkdownSource",
  "toggleDarkPages",
  "toggleInvertImages",
  "toggleCaretBrowsing",
  ...Object.values(scrollModeCommands),
  ...Object.values(spreadModeCommands),
]);

export type MenuState = {
  hasDocument: boolean;
  hasMarkdown: boolean;
  markdownSource: boolean;
  split: boolean;
  comparing: boolean;
  documentMap: boolean;
  documentMapAvailable: boolean;
  darkPages: boolean;
  invertImages: boolean;
  caretBrowsing: boolean;
} & ViewModes;

export function checkedCommands(state: MenuState): Set<CommandId> {
  const checks: Array<[CommandId, boolean]> = [
    ["toggleDocumentMap", state.documentMap && state.documentMapAvailable],
    ["toggleMarkdownSource", state.hasMarkdown && state.markdownSource],
    ["toggleDarkPages", state.darkPages],
    ["toggleInvertImages", state.invertImages],
    ["toggleCaretBrowsing", state.caretBrowsing],
    [scrollModeCommands[state.scrollMode], state.hasDocument],
    [spreadModeCommands[state.spreadMode], state.hasDocument],
  ];
  return new Set(checks.flatMap(([id, checked]) => (checked ? [id] : [])));
}

export type AppMenu = {
  activate: () => Promise<void>;
  setState: (state: MenuState) => Promise<void>;
  setRecent: (entries: RecentEntry[]) => Promise<void>;
};

type MenuCallbacks = {
  onCommand: (id: CommandId) => void;
  onOpenRecent: (entry: RecentEntry) => void;
  onClearRecent: () => void;
};

export async function installAppMenu(callbacks: MenuCallbacks): Promise<AppMenu> {
  const documentItems: Array<[Command, MenuItem | CheckMenuItem]> = [];
  const checkItems = new Map<CommandId, CheckMenuItem>();
  const splitItems: MenuItem[] = [];
  const comparisonItems: MenuItem[] = [];
  const recentMenu = await Submenu.new({ text: "Open Recent", items: [] });

  const commandItem = async (id: CommandId) => {
    const command = commandById.get(id)!;
    const accelerator = command.combos.map(acceleratorFor).find(Boolean) ?? undefined;
    const options = {
      text: command.label,
      accelerator,
      action: () => {
        callbacks.onCommand(id);
        if (radioCommands.has(id)) {
          checkItems.get(id)?.setChecked(true);
        }
      },
    };
    const item = checkCommands.has(id) ? await CheckMenuItem.new({ ...options, checked: false }) : await MenuItem.new(options);
    if (item instanceof CheckMenuItem) {
      checkItems.set(id, item);
    }
    if (command.needsDocument || command.needsMarkdown) {
      documentItems.push([command, item]);
    }
    if (command.needsSplit && item instanceof MenuItem) {
      splitItems.push(item);
    }
    if (command.needsComparison && item instanceof MenuItem) {
      comparisonItems.push(item);
    }
    return item;
  };

  const slotItem = (slot: Slot) => {
    if (slot === "-") {
      return PredefinedMenuItem.new({ item: "Separator" });
    }
    if (slot === "recent") {
      return Promise.resolve(recentMenu);
    }
    if (typeof slot === "object") {
      return PredefinedMenuItem.new({ item: slot.predefined });
    }
    return commandItem(slot);
  };

  const submenus = [];
  for (const [name, slots] of menuLayout) {
    const items = [];
    for (const slot of slots) {
      items.push(await slotItem(slot));
    }
    submenus.push(await Submenu.new({ text: name, items }));
  }
  const menu = await Menu.new({ items: submenus });
  await menu.setAsAppMenu();

  return {
    async activate() {
      await menu.setAsAppMenu();
    },
    async setState(state) {
      const checked = checkedCommands(state);
      await Promise.all([
        ...documentItems.map(([command, item]) => item.setEnabled(documentAvailable(command, state))),
        ...splitItems.map((item) => item.setEnabled(state.split)),
        ...comparisonItems.map((item) => item.setEnabled(state.comparing)),
        checkItems.get("toggleDocumentMap")?.setEnabled(state.documentMapAvailable),
        ...[...checkItems].map(([id, item]) => item.setChecked(checked.has(id))),
      ]);
    },
    async setRecent(entries) {
      for (const item of await recentMenu.items()) {
        await recentMenu.remove(item);
      }
      if (!entries.length) {
        await recentMenu.append(await MenuItem.new({ text: "No Recent Files", enabled: false }));
        return;
      }
      const items = [];
      for (const entry of entries.slice(0, RECENT_LIMIT)) {
        items.push(await MenuItem.new({ text: `${entry.name}  —  ${entry.location}`, action: () => callbacks.onOpenRecent(entry) }));
      }
      items.push(await PredefinedMenuItem.new({ item: "Separator" }));
      items.push(await MenuItem.new({ text: "Clear Recently Opened", action: callbacks.onClearRecent }));
      await recentMenu.append(items);
    },
  };
}
