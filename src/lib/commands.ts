export type CommandId =
  | "about"
  | "checkUpdates"
  | "makeDefault"
  | "newTab"
  | "open"
  | "closeTab"
  | "closeWindow"
  | "save"
  | "saveAs"
  | "revealInFinder"
  | "undo"
  | "redo"
  | "find"
  | "findNext"
  | "findPrevious"
  | "useSelectionForFind"
  | "toggleSidebar"
  | "showPages"
  | "showOutline"
  | "actualSize"
  | "zoomIn"
  | "zoomOut"
  | "fitWidth"
  | "fitPage"
  | "rotateRight"
  | "rotateLeft"
  | "toggleDarkPages"
  | "toggleInvertImages"
  | "previousPage"
  | "nextPage"
  | "firstPage"
  | "lastPage"
  | "goToPage"
  | "toolSelect"
  | "toolHighlight"
  | "toolText"
  | "toolDraw"
  | "addImage"
  | "sign"
  | "nextTab"
  | "previousTab"
  | `tab${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  | "keyboardShortcuts"
  | "whatsNew"
  | "openGitHub"
  | "reportIssue"
  | "escape";

export type MenuName = "Clumsy" | "File" | "Edit" | "View" | "Go" | "Tools" | "Window" | "Help";

export type Command = {
  id: CommandId;
  label: string;
  menu: MenuName | null;
  combos: string[];
  needsDocument?: boolean;
};

const tabCommands: Command[] = ([1, 2, 3, 4, 5, 6, 7, 8] as const).map((index) => ({
  id: `tab${index}` as const,
  label: `Show Tab ${index}`,
  menu: null,
  combos: [`mod+${index}`],
}));

export const commands: Command[] = [
  { id: "about", label: "About Clumsy", menu: "Clumsy", combos: [] },
  { id: "checkUpdates", label: "Check for Updates…", menu: "Clumsy", combos: [] },
  { id: "makeDefault", label: "Make Clumsy the Default PDF App…", menu: "Clumsy", combos: [] },

  { id: "newTab", label: "New Tab", menu: "File", combos: ["mod+t"] },
  { id: "open", label: "Open…", menu: "File", combos: ["mod+o"] },
  { id: "closeTab", label: "Close Tab", menu: "File", combos: ["mod+w"] },
  { id: "closeWindow", label: "Close Window", menu: "File", combos: ["mod+shift+w"] },
  { id: "save", label: "Save", menu: "File", combos: ["mod+s"], needsDocument: true },
  { id: "saveAs", label: "Save As…", menu: "File", combos: ["mod+shift+s"], needsDocument: true },
  { id: "revealInFinder", label: "Show in Finder", menu: "File", combos: ["alt+mod+r"], needsDocument: true },

  { id: "undo", label: "Undo", menu: "Edit", combos: ["mod+z"] },
  { id: "redo", label: "Redo", menu: "Edit", combos: ["mod+shift+z"] },
  { id: "find", label: "Find…", menu: "Edit", combos: ["mod+f"], needsDocument: true },
  { id: "findNext", label: "Find Next", menu: "Edit", combos: ["mod+g"], needsDocument: true },
  { id: "findPrevious", label: "Find Previous", menu: "Edit", combos: ["mod+shift+g"], needsDocument: true },
  { id: "useSelectionForFind", label: "Use Selection for Find", menu: "Edit", combos: ["mod+e"], needsDocument: true },

  { id: "toggleSidebar", label: "Toggle Sidebar", menu: "View", combos: ["mod+\\"], needsDocument: true },
  { id: "showPages", label: "Page Thumbnails", menu: "View", combos: ["alt+mod+1"], needsDocument: true },
  { id: "showOutline", label: "Outline", menu: "View", combos: ["alt+mod+2"], needsDocument: true },
  { id: "actualSize", label: "Actual Size", menu: "View", combos: ["mod+0"], needsDocument: true },
  { id: "zoomIn", label: "Zoom In", menu: "View", combos: ["mod+=", "mod+shift+="], needsDocument: true },
  { id: "zoomOut", label: "Zoom Out", menu: "View", combos: ["mod+-"], needsDocument: true },
  { id: "fitWidth", label: "Fit Width", menu: "View", combos: ["mod+9"], needsDocument: true },
  { id: "fitPage", label: "Fit Page", menu: "View", combos: ["alt+mod+9"], needsDocument: true },
  { id: "rotateLeft", label: "Rotate Left", menu: "View", combos: ["mod+l"], needsDocument: true },
  { id: "rotateRight", label: "Rotate Right", menu: "View", combos: ["mod+r"], needsDocument: true },
  { id: "toggleDarkPages", label: "Dark Pages", menu: "View", combos: ["mod+shift+d"] },
  { id: "toggleInvertImages", label: "Invert Images in Dark Pages", menu: "View", combos: [] },

  { id: "previousPage", label: "Previous Page", menu: "Go", combos: ["alt+mod+ArrowUp", "p", "k"], needsDocument: true },
  { id: "nextPage", label: "Next Page", menu: "Go", combos: ["alt+mod+ArrowDown", "n", "j"], needsDocument: true },
  { id: "firstPage", label: "First Page", menu: "Go", combos: ["shift+alt+mod+ArrowUp", "Home"], needsDocument: true },
  { id: "lastPage", label: "Last Page", menu: "Go", combos: ["shift+alt+mod+ArrowDown", "End"], needsDocument: true },
  { id: "goToPage", label: "Go to Page…", menu: "Go", combos: ["alt+mod+g"], needsDocument: true },

  { id: "toolSelect", label: "Select", menu: "Tools", combos: ["v"], needsDocument: true },
  { id: "toolHighlight", label: "Highlight", menu: "Tools", combos: ["ctrl+mod+h", "h"], needsDocument: true },
  { id: "toolText", label: "Text Note", menu: "Tools", combos: ["ctrl+mod+t", "t"], needsDocument: true },
  { id: "toolDraw", label: "Draw", menu: "Tools", combos: ["ctrl+mod+p", "d"], needsDocument: true },
  { id: "addImage", label: "Add Image…", menu: "Tools", combos: ["ctrl+mod+i"], needsDocument: true },
  { id: "sign", label: "Sign…", menu: "Tools", combos: ["ctrl+mod+s"], needsDocument: true },

  { id: "nextTab", label: "Show Next Tab", menu: "Window", combos: ["mod+shift+]", "ctrl+Tab"] },
  { id: "previousTab", label: "Show Previous Tab", menu: "Window", combos: ["mod+shift+[", "ctrl+shift+Tab"] },
  ...tabCommands,

  { id: "keyboardShortcuts", label: "Keyboard Shortcuts", menu: "Help", combos: ["mod+/"] },
  { id: "whatsNew", label: "What's New", menu: "Help", combos: [] },
  { id: "openGitHub", label: "Clumsy on GitHub", menu: "Help", combos: [] },
  { id: "reportIssue", label: "Report an Issue…", menu: "Help", combos: [] },

  { id: "escape", label: "Close Find / Back to Select", menu: null, combos: ["Escape"] },
];

export const commandById = new Map(commands.map((command) => [command.id, command]));

const MODIFIERS = ["ctrl", "shift", "alt", "mod"] as const;

const codeKeys: Record<string, string> = {
  Equal: "=",
  Minus: "-",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Slash: "/",
};

export type KeyInput = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"> & { code?: string };

function keyName(event: KeyInput) {
  const code = event.code ?? "";
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }
  if (codeKeys[code]) {
    return codeKeys[code];
  }
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

export function comboFromEvent(event: KeyInput, isMac: boolean) {
  const pressed = {
    ctrl: isMac ? event.ctrlKey : false,
    shift: event.shiftKey,
    alt: event.altKey,
    mod: isMac ? event.metaKey : event.ctrlKey,
  };
  if (!isMac && event.metaKey) {
    return null;
  }
  return [...MODIFIERS.filter((modifier) => pressed[modifier]), keyName(event)].join("+");
}

function normalize(combo: string) {
  const parts = combo.split("+");
  const key = parts.pop()!;
  const mods = new Set(parts);
  return [...MODIFIERS.filter((modifier) => mods.has(modifier)), key].join("+");
}

const comboIndex = new Map<string, CommandId>();
for (const command of commands) {
  for (const combo of command.combos) {
    comboIndex.set(normalize(combo), command.id);
  }
}

export function isPlainCombo(combo: string) {
  return !MODIFIERS.some((modifier) => normalize(combo).startsWith(`${modifier}+`));
}

export function resolveCommand(event: KeyInput, isMac: boolean, isTyping: boolean): CommandId | null {
  const combo = comboFromEvent(event, isMac);
  if (!combo) {
    return null;
  }
  const id = comboIndex.get(combo) ?? null;
  if (!id || id === "escape") {
    return id;
  }
  return isTyping && isPlainCombo(combo) ? null : id;
}

const acceleratorKeys: Record<string, string> = {
  "=": "Equal",
  "-": "Minus",
  "\\": "Backslash",
  "[": "BracketLeft",
  "]": "BracketRight",
  "/": "Slash",
};

export function acceleratorFor(combo: string) {
  if (isPlainCombo(combo)) {
    return null;
  }
  const parts = normalize(combo).split("+");
  const key = parts.pop()!;
  const names: Record<string, string> = { ctrl: "Ctrl", shift: "Shift", alt: "Alt", mod: "CmdOrCtrl" };
  return [...parts.map((part) => names[part]), acceleratorKeys[key] ?? (key.length === 1 ? key.toUpperCase() : key)].join("+");
}

const macSymbols: Record<string, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", mod: "⌘" };
const keySymbols: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Tab: "⇥",
  Escape: "Esc",
};

export function displayCombo(combo: string, isMac: boolean) {
  const parts = normalize(combo).split("+");
  const key = parts.pop()!;
  const label = keySymbols[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  if (isMac) {
    const order = ["ctrl", "alt", "shift", "mod"];
    return `${order.filter((modifier) => parts.includes(modifier)).map((modifier) => macSymbols[modifier]).join("")}${label}`;
  }
  const names: Record<string, string> = { ctrl: "Ctrl", shift: "Shift", alt: "Alt", mod: "Ctrl" };
  return [...parts.map((part) => names[part]), label].join("+");
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
