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
};

const shiftedCommandKeys: Record<string, ShortcutAction> = {
  s: "saveAs",
  g: "findPrevious",
  "+": "zoomIn",
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
