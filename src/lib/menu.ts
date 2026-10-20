import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { acceleratorFor, commandById, type CommandId, type MenuName } from "./commands";
import type { RecentEntry } from "./recent";

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
  ["File", ["newTab", "newWindow", "open", "recent", "-", "closeTab", "closeWindow", "-", "save", "saveAs", "-", "revealInFinder"]],
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
      "toggleSidebar",
      "showPages",
      "showOutline",
      "-",
      "splitRight",
      "closeSplit",
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
      "toggleDarkPages",
      "toggleInvertImages",
      "-",
      { predefined: "Fullscreen" },
    ],
  ],
  ["Go", ["previousPage", "nextPage", "firstPage", "lastPage", "-", "goToPage"]],
  ["Tools", ["toolSelect", "toolHighlight", "toolText", "toolDraw", "-", "addImage", "sign"]],
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

const checkCommands = new Set<CommandId>(["toggleDarkPages", "toggleInvertImages"]);
const splitCommands = new Set<CommandId>(["closeSplit", "focusLeftPane", "focusRightPane", "moveTabLeft"]);

export type MenuState = { hasDocument: boolean; split: boolean; darkPages: boolean; invertImages: boolean };

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
  const documentItems: Array<MenuItem | CheckMenuItem> = [];
  const checkItems = new Map<CommandId, CheckMenuItem>();
  const splitItems: MenuItem[] = [];
  const recentMenu = await Submenu.new({ text: "Open Recent", items: [] });

  const commandItem = async (id: CommandId) => {
    const command = commandById.get(id)!;
    const accelerator = command.combos.map(acceleratorFor).find(Boolean) ?? undefined;
    const options = { text: command.label, accelerator, action: () => callbacks.onCommand(id) };
    const item = checkCommands.has(id) ? await CheckMenuItem.new({ ...options, checked: false }) : await MenuItem.new(options);
    if (item instanceof CheckMenuItem) {
      checkItems.set(id, item);
    }
    if (command.needsDocument) {
      documentItems.push(item);
    }
    if (splitCommands.has(id) && item instanceof MenuItem) {
      splitItems.push(item);
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
    async setState({ hasDocument, split, darkPages, invertImages }) {
      await Promise.all([
        ...documentItems.map((item) => item.setEnabled(hasDocument)),
        ...splitItems.map((item) => item.setEnabled(split)),
        checkItems.get("toggleDarkPages")?.setChecked(darkPages),
        checkItems.get("toggleInvertImages")?.setChecked(invertImages),
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
