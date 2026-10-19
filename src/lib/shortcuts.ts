export type ShortcutAction =
  | "open"
  | "save"
  | "saveAs"
  | "find"
  | "findNext"
  | "findPrevious"
  | "zoomIn"
  | "zoomOut"
  | "actualSize"
  | "fitWidth"
  | "rotate"
  | "toggleSidebar"
  | "firstPage"
  | "lastPage"
  | "nextPage"
  | "previousPage"
  | "toolSelect"
  | "toolHighlight"
  | "toolText"
  | "toolDraw"
  | "newTab"
  | "closeTab"
  | "nextTab"
  | "previousTab"
  | `tab${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  | "escape";

export type KeyInput = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

const commandKeys: Record<string, ShortcutAction> = {
  o: "open",
  s: "save",
  f: "find",
  g: "findNext",
  "=": "zoomIn",
  "+": "zoomIn",
  "-": "zoomOut",
  "0": "actualSize",
  "9": "fitWidth",
  r: "rotate",
  "\\": "toggleSidebar",
  t: "newTab",
  w: "closeTab",
  "1": "tab1",
  "2": "tab2",
  "3": "tab3",
  "4": "tab4",
  "5": "tab5",
  "6": "tab6",
  "7": "tab7",
  "8": "tab8",
};

const shiftedCommandKeys: Record<string, ShortcutAction> = {
  s: "saveAs",
  g: "findPrevious",
  "+": "zoomIn",
  "}": "nextTab",
  "]": "nextTab",
  "{": "previousTab",
  "[": "previousTab",
};

const plainKeys: Record<string, ShortcutAction> = {
  Home: "firstPage",
  End: "lastPage",
  n: "nextPage",
  j: "nextPage",
  p: "previousPage",
  k: "previousPage",
  v: "toolSelect",
  h: "toolHighlight",
  t: "toolText",
  d: "toolDraw",
};

export function resolveShortcut(event: KeyInput, isMac: boolean, isTyping: boolean): ShortcutAction | null {
  if (event.key === "Escape") {
    return "escape";
  }

  if (event.key === "Tab" && event.ctrlKey && !event.metaKey && !event.altKey) {
    return event.shiftKey ? "previousTab" : "nextTab";
  }

  const mod = isMac ? event.metaKey : event.ctrlKey;
  const otherMod = isMac ? event.ctrlKey : event.metaKey;
  if (mod && !otherMod && !event.altKey) {
    const key = event.key.toLowerCase();
    return (event.shiftKey ? shiftedCommandKeys[key] : commandKeys[key]) ?? null;
  }

  if (isTyping || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return null;
  }
  return plainKeys[event.key] ?? null;
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
