export type CommandId =
  | "about"
  | "checkUpdates"
  | "makeDefault"
  | "newTab"
  | "reopenClosedTab"
  | "newWindow"
  | "moveTabToNewWindow"
  | "open"
  | "combineFiles"
  | "compareWithFile"
  | "compareSplitPanes"
  | "exportComparison"
  | "nextChange"
  | "previousChange"
  | "swapComparison"
  | "toggleLinkedScroll"
  | "endComparison"
  | "closeTab"
  | "closeWindow"
  | "save"
  | "saveAs"
  | "saveAll"
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
  | "toggleDocumentMap"
  | "actualSize"
  | "zoomIn"
  | "zoomOut"
  | "fitWidth"
  | "fitPage"
  | "rotateRight"
  | "rotateLeft"
  | "toggleDarkPages"
  | "toggleInvertImages"
  | "scrollVertical"
  | "scrollHorizontal"
  | "scrollWrapped"
  | "scrollPage"
  | "spreadNone"
  | "spreadOdd"
  | "spreadEven"
  | "toggleCaretBrowsing"
  | "previousPage"
  | "nextPage"
  | "firstPage"
  | "lastPage"
  | "goToPage"
  | "goBack"
  | "goForward"
  | "quickOpen"
  | "commandPalette"
  | "toolSelect"
  | "toolHand"
  | "toolHighlight"
  | "toolText"
  | "toolDraw"
  | "addImage"
  | "sign"
  | "insertPages"
  | "rotatePagesLeft"
  | "rotatePagesRight"
  | "deletePages"
  | "extractPages"
  | "nextTab"
  | "previousTab"
  | "splitRight"
  | "closeSplit"
  | "moveTabLeft"
  | "moveTabRight"
  | "focusLeftPane"
  | "focusRightPane"
  | `tab${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  | "keyboardShortcuts"
  | "whatsNew"
  | "openGitHub"
  | "reportIssue"
  | "quit"
  | "escape";

export type MenuName = "Clumsy" | "File" | "Edit" | "View" | "Go" | "Pages" | "Tools" | "Window" | "Help";

export type Command = {
  id: CommandId;
  label: string;
  menu: MenuName | null;
  combos: string[];
  needsDocument?: boolean;
  needsSplit?: boolean;
  needsComparison?: boolean;
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
  { id: "quit", label: "Quit Clumsy", menu: "Clumsy", combos: ["mod+q"] },

  { id: "newTab", label: "New Tab", menu: "File", combos: ["mod+n", "mod+t"] },
  { id: "newWindow", label: "New Window", menu: "File", combos: ["mod+shift+n"] },
  { id: "reopenClosedTab", label: "Reopen Closed Tab", menu: "File", combos: ["mod+shift+t"] },
  { id: "open", label: "Open…", menu: "File", combos: ["mod+o"] },
  { id: "combineFiles", label: "Combine Files…", menu: "File", combos: [] },
  { id: "compareWithFile", label: "Compare With File…", menu: "File", combos: [], needsDocument: true },
  { id: "exportComparison", label: "Export Comparison Report…", menu: "File", combos: [], needsComparison: true },
  { id: "closeTab", label: "Close Tab", menu: "File", combos: ["mod+w"] },
  { id: "closeWindow", label: "Close Window", menu: "File", combos: ["mod+shift+w"] },
  { id: "save", label: "Save", menu: "File", combos: ["mod+s"], needsDocument: true },
  { id: "saveAs", label: "Save As…", menu: "File", combos: ["mod+shift+s"], needsDocument: true },
  { id: "saveAll", label: "Save All", menu: "File", combos: ["alt+mod+s"] },
  { id: "revealInFinder", label: "Show in Finder", menu: "File", combos: ["alt+mod+r"], needsDocument: true },

  { id: "undo", label: "Undo", menu: "Edit", combos: ["mod+z"] },
  { id: "redo", label: "Redo", menu: "Edit", combos: ["mod+shift+z"] },
  { id: "find", label: "Find…", menu: "Edit", combos: ["mod+f"], needsDocument: true },
  { id: "findNext", label: "Find Next", menu: "Edit", combos: ["mod+g"], needsDocument: true },
  { id: "findPrevious", label: "Find Previous", menu: "Edit", combos: ["mod+shift+g"], needsDocument: true },
  { id: "useSelectionForFind", label: "Use Selection for Find", menu: "Edit", combos: ["mod+e"], needsDocument: true },

  { id: "commandPalette", label: "Command Palette…", menu: "View", combos: ["mod+shift+p"] },
  { id: "toggleSidebar", label: "Toggle Sidebar", menu: "View", combos: ["mod+b"], needsDocument: true },
  { id: "showPages", label: "Page Thumbnails", menu: "View", combos: ["mod+shift+e"], needsDocument: true },
  { id: "showOutline", label: "Outline", menu: "View", combos: ["mod+shift+o"], needsDocument: true },
  { id: "toggleDocumentMap", label: "Document Map", menu: "View", combos: ["alt+mod+b"] },
  { id: "actualSize", label: "Actual Size", menu: "View", combos: ["mod+0"], needsDocument: true },
  { id: "zoomIn", label: "Zoom In", menu: "View", combos: ["mod+=", "mod+shift+="], needsDocument: true },
  { id: "zoomOut", label: "Zoom Out", menu: "View", combos: ["mod+-"], needsDocument: true },
  { id: "fitWidth", label: "Fit Width", menu: "View", combos: ["mod+9"], needsDocument: true },
  { id: "fitPage", label: "Fit Page", menu: "View", combos: ["alt+mod+9"], needsDocument: true },
  { id: "rotateLeft", label: "Rotate Left", menu: "View", combos: ["mod+l"], needsDocument: true },
  { id: "rotateRight", label: "Rotate Right", menu: "View", combos: ["mod+r"], needsDocument: true },
  { id: "splitRight", label: "Split Right", menu: "View", combos: ["mod+\\"] },
  { id: "closeSplit", label: "Close Split", menu: "View", combos: ["mod+shift+\\"], needsSplit: true },
  { id: "compareSplitPanes", label: "Compare Split Panes", menu: "View", combos: [], needsSplit: true },
  { id: "swapComparison", label: "Swap Compared Sides", menu: "View", combos: [], needsComparison: true },
  { id: "toggleLinkedScroll", label: "Toggle Linked Scrolling", menu: "View", combos: [], needsComparison: true },
  { id: "endComparison", label: "End Comparison", menu: "View", combos: [], needsComparison: true },
  { id: "toggleDarkPages", label: "Dark Pages", menu: "View", combos: ["mod+shift+d"] },
  { id: "toggleInvertImages", label: "Invert Images in Dark Pages", menu: "View", combos: [] },
  { id: "scrollVertical", label: "Vertical Scrolling", menu: "View", combos: [], needsDocument: true },
  { id: "scrollHorizontal", label: "Horizontal Scrolling", menu: "View", combos: [], needsDocument: true },
  { id: "scrollWrapped", label: "Wrapped Scrolling", menu: "View", combos: [], needsDocument: true },
  { id: "scrollPage", label: "Page Scrolling", menu: "View", combos: [], needsDocument: true },
  { id: "spreadNone", label: "No Spreads", menu: "View", combos: [], needsDocument: true },
  { id: "spreadOdd", label: "Odd Spreads", menu: "View", combos: [], needsDocument: true },
  { id: "spreadEven", label: "Even Spreads", menu: "View", combos: [], needsDocument: true },
  { id: "toggleCaretBrowsing", label: "Caret Browsing", menu: "View", combos: ["F7"] },

  { id: "previousPage", label: "Previous Page", menu: "Go", combos: ["alt+mod+ArrowUp", "p", "k"], needsDocument: true },
  { id: "nextPage", label: "Next Page", menu: "Go", combos: ["alt+mod+ArrowDown", "n", "j"], needsDocument: true },
  { id: "firstPage", label: "First Page", menu: "Go", combos: ["mod+ArrowUp", "Home"], needsDocument: true },
  { id: "lastPage", label: "Last Page", menu: "Go", combos: ["mod+ArrowDown", "End"], needsDocument: true },
  { id: "goToPage", label: "Go to Page…", menu: "Go", combos: ["ctrl+g"], needsDocument: true },
  { id: "goBack", label: "Go Back", menu: "Go", combos: ["ctrl+-"], needsDocument: true },
  { id: "goForward", label: "Go Forward", menu: "Go", combos: ["ctrl+shift+-"], needsDocument: true },
  { id: "nextChange", label: "Next Change", menu: "Go", combos: ["alt+F5"], needsComparison: true },
  { id: "previousChange", label: "Previous Change", menu: "Go", combos: ["shift+alt+F5"], needsComparison: true },
  { id: "quickOpen", label: "Go to File…", menu: "Go", combos: ["mod+p"] },

  { id: "toolSelect", label: "Select", menu: "Tools", combos: ["v"], needsDocument: true },
  { id: "toolHand", label: "Hand", menu: "Tools", combos: [], needsDocument: true },
  { id: "toolHighlight", label: "Highlight", menu: "Tools", combos: ["ctrl+mod+h", "h"], needsDocument: true },
  { id: "toolText", label: "Text Note", menu: "Tools", combos: ["ctrl+mod+t", "t"], needsDocument: true },
  { id: "toolDraw", label: "Draw", menu: "Tools", combos: ["ctrl+mod+p", "d"], needsDocument: true },
  { id: "addImage", label: "Add Image…", menu: "Tools", combos: ["ctrl+mod+i"], needsDocument: true },
  { id: "sign", label: "Sign…", menu: "Tools", combos: ["ctrl+mod+s"], needsDocument: true },

  { id: "insertPages", label: "Insert Pages from File…", menu: "Pages", combos: ["alt+mod+i"], needsDocument: true },
  { id: "rotatePagesLeft", label: "Rotate Pages Left", menu: "Pages", combos: [], needsDocument: true },
  { id: "rotatePagesRight", label: "Rotate Pages Right", menu: "Pages", combos: [], needsDocument: true },
  { id: "deletePages", label: "Delete Pages", menu: "Pages", combos: [], needsDocument: true },
  { id: "extractPages", label: "Extract Pages to New Tab", menu: "Pages", combos: [], needsDocument: true },

  { id: "nextTab", label: "Show Next Tab", menu: "Window", combos: ["mod+shift+]", "ctrl+Tab"] },
  { id: "previousTab", label: "Show Previous Tab", menu: "Window", combos: ["mod+shift+[", "ctrl+shift+Tab"] },
  { id: "focusLeftPane", label: "Focus Left Pane", menu: "Window", combos: ["alt+mod+ArrowLeft"], needsSplit: true },
  { id: "focusRightPane", label: "Focus Right Pane", menu: "Window", combos: ["alt+mod+ArrowRight"], needsSplit: true },
  { id: "moveTabLeft", label: "Move Tab to Left Pane", menu: "Window", combos: ["ctrl+mod+ArrowLeft"], needsSplit: true },
  { id: "moveTabRight", label: "Move Tab to Right Pane", menu: "Window", combos: ["ctrl+mod+ArrowRight"] },
  { id: "moveTabToNewWindow", label: "Move Tab to New Window", menu: "Window", combos: ["alt+mod+n"] },
  ...tabCommands,

  { id: "keyboardShortcuts", label: "Keyboard Shortcuts", menu: "Help", combos: ["mod+k", "mod+/"] },
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

const isFunctionKey = (combo: string) => /^F\d{1,2}$/.test(normalize(combo).split("+").pop()!);

const caretKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
const caretModifiers = new Set(["", "mod", "alt"]);

export function movesCaret(combo: string) {
  const parts = normalize(combo).split("+");
  const key = parts.pop()!;
  return caretKeys.has(key) && caretModifiers.has(parts.filter((part) => part !== "shift").join("+"));
}

export function resolveCommand(event: KeyInput, isMac: boolean, isTyping: boolean, inCaretField = isTyping): CommandId | null {
  const combo = comboFromEvent(event, isMac);
  if (!combo) {
    return null;
  }
  const id = comboIndex.get(combo) ?? null;
  if (!id || id === "escape") {
    return id;
  }
  return (isTyping && isPlainCombo(combo)) || (inCaretField && movesCaret(combo)) ? null : id;
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
  if (isPlainCombo(combo) && !isFunctionKey(combo)) {
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

export function shortcutFor(id: CommandId, isMac: boolean) {
  const combo = commandById.get(id)?.combos[0];
  return combo ? displayCombo(combo, isMac) : null;
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
