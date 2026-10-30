import { describe, expect, it } from "vitest";
import {
  acceleratorFor,
  commandAvailable,
  commandById,
  commands,
  comboFromEvent,
  displayCombo,
  movesCaret,
  resolveCommand,
  shortcutFor,
  type CommandId,
  type KeyInput,
} from "../src/lib/commands";

const codeFor = (key: string) => {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  return { "=": "Equal", "-": "Minus", "\\": "Backslash", "[": "BracketLeft", "]": "BracketRight", "/": "Slash" }[key] ?? key;
};

function eventFor(combo: string): KeyInput {
  const parts = combo.split("+");
  const key = parts.pop()!;
  return {
    key,
    code: codeFor(key),
    metaKey: parts.includes("mod"),
    ctrlKey: parts.includes("ctrl"),
    shiftKey: parts.includes("shift"),
    altKey: parts.includes("alt"),
  };
}

describe("command table", () => {
  it("resolves every listed combo to its own command", () => {
    for (const command of commands) {
      for (const combo of command.combos) {
        expect(resolveCommand(eventFor(combo), true, false), `${command.id} ${combo}`).toBe(command.id);
      }
    }
  });

  it("never assigns one combo to two commands", () => {
    const seen = new Map<string, string>();
    for (const command of commands) {
      for (const combo of command.combos) {
        const key = comboFromEvent(eventFor(combo), true)!;
        expect(seen.get(key), `${combo} used by ${seen.get(key)} and ${command.id}`).toBeUndefined();
        seen.set(key, command.id);
      }
    }
  });

  it("gives every menu command with a modifier combo a valid accelerator", () => {
    for (const command of commands.filter((candidate) => candidate.menu)) {
      const accelerator = command.combos.map(acceleratorFor).find(Boolean);
      if (accelerator) {
        expect(accelerator).toMatch(/^(((Ctrl|Shift|Alt|CmdOrCtrl)\+)+([A-Z0-9]|Equal|Minus|Backslash|BracketLeft|BracketRight|Slash|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Tab|F\d{1,2})|F\d{1,2})$/);
      }
    }
  });
});

describe("commandAvailable", () => {
  const available = (id: CommandId, context: Parameters<typeof commandAvailable>[1]) => commandAvailable(commandById.get(id)!, context);
  const markdownTab = { hasDocument: false, hasMarkdown: true, split: false, comparing: false };
  const pdfTab = { hasDocument: true, hasMarkdown: false, split: false, comparing: false };

  it("offers file commands for Markdown tabs and keeps PDF-only ones off", () => {
    for (const id of ["save", "saveAs", "find", "findNext", "toggleSidebar", "showOutline", "zoomIn", "firstPage", "toggleMarkdownSource"] as const) {
      expect(available(id, markdownTab), id).toBe(true);
    }
    for (const id of ["fitWidth", "rotateRight", "toolHighlight", "deletePages", "exportPagesAsImages", "compareWithFile", "goToPage", "showPages"] as const) {
      expect(available(id, markdownTab), id).toBe(false);
    }
  });

  it("only offers the source toggle for Markdown tabs", () => {
    expect(available("toggleMarkdownSource", pdfTab)).toBe(false);
    expect(available("fitWidth", pdfTab)).toBe(true);
    expect(available("open", { ...pdfTab, hasDocument: false })).toBe(true);
  });

  it("binds the source toggle to VS Code's preview shortcut", () => {
    expect(resolveCommand({ key: "V", code: "KeyV", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }, true, false)).toBe("toggleMarkdownSource");
  });
});

describe("resolveCommand", () => {
  it("uses physical keys so Option combos work", () => {
    expect(resolveCommand({ key: "ª", code: "Digit9", metaKey: true, altKey: true, ctrlKey: false, shiftKey: false }, true, false)).toBe("fitPage");
    expect(resolveCommand({ key: "ß", code: "KeyS", metaKey: true, altKey: true, ctrlKey: false, shiftKey: false }, true, false)).toBe("saveAll");
  });

  it("treats shift+= as zoom in", () => {
    expect(resolveCommand({ key: "+", code: "Equal", metaKey: true, shiftKey: true, altKey: false, ctrlKey: false }, true, false)).toBe("zoomIn");
  });

  it("ignores plain keys while typing but keeps command keys and Escape", () => {
    expect(resolveCommand(eventFor("h"), true, true)).toBeNull();
    expect(resolveCommand(eventFor("Home"), true, true)).toBeNull();
    expect(resolveCommand(eventFor("mod+f"), true, true)).toBe("find");
    expect(resolveCommand(eventFor("Escape"), true, true)).toBe("escape");
  });

  it("leaves caret movement to text fields while typing", () => {
    expect(resolveCommand(eventFor("mod+ArrowUp"), true, false)).toBe("firstPage");
    expect(resolveCommand(eventFor("mod+ArrowDown"), true, false)).toBe("lastPage");
    expect(resolveCommand(eventFor("mod+ArrowUp"), true, true)).toBeNull();
    expect(resolveCommand(eventFor("mod+ArrowDown"), true, true)).toBeNull();
    expect(resolveCommand(eventFor("alt+mod+ArrowUp"), true, true)).toBe("previousPage");
    expect(resolveCommand(eventFor("ctrl+mod+ArrowLeft"), true, true)).toBe("moveTabLeft");
    expect(resolveCommand(eventFor("mod+ArrowDown"), true, true, false)).toBe("lastPage");
    expect(resolveCommand(eventFor("h"), true, true, false)).toBeNull();
  });

  it("follows the code editor layout", () => {
    expect(resolveCommand(eventFor("mod+b"), true, false)).toBe("toggleSidebar");
    expect(resolveCommand(eventFor("mod+shift+e"), true, false)).toBe("showPages");
    expect(resolveCommand(eventFor("mod+shift+o"), true, false)).toBe("showOutline");
    expect(resolveCommand(eventFor("mod+n"), true, false)).toBe("newTab");
    expect(resolveCommand(eventFor("mod+t"), true, false)).toBe("newTab");
    expect(resolveCommand(eventFor("mod+shift+n"), true, false)).toBe("newWindow");
    expect(resolveCommand(eventFor("mod+shift+t"), true, false)).toBe("reopenClosedTab");
    expect(resolveCommand(eventFor("ctrl+g"), true, false)).toBe("goToPage");
    expect(resolveCommand(eventFor("mod+p"), true, false)).toBe("quickOpen");
    expect(resolveCommand(eventFor("mod+shift+p"), true, false)).toBe("commandPalette");
    expect(resolveCommand(eventFor("mod+1"), true, false)).toBe("tab1");
    expect(resolveCommand(eventFor("ctrl+-"), true, false)).toBe("goBack");
    expect(resolveCommand(eventFor("ctrl+shift+-"), true, false)).toBe("goForward");
    expect(resolveCommand(eventFor("F7"), true, false)).toBe("toggleCaretBrowsing");
  });

  it("ignores unlisted combos", () => {
    expect(resolveCommand(eventFor("mod+j"), true, false)).toBeNull();
    expect(resolveCommand(eventFor("shift+h"), true, false)).toBeNull();
  });

  it("opens keyboard shortcuts with either combo", () => {
    expect(resolveCommand(eventFor("mod+k"), true, false)).toBe("keyboardShortcuts");
    expect(resolveCommand(eventFor("mod+/"), true, false)).toBe("keyboardShortcuts");
  });

  it("maps Ctrl to the command modifier off macOS", () => {
    expect(resolveCommand({ key: "o", code: "KeyO", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, false, false)).toBe("open");
  });
});

describe("movesCaret", () => {
  it("covers the text navigation keys", () => {
    for (const combo of ["ArrowUp", "mod+ArrowUp", "shift+mod+ArrowDown", "alt+ArrowLeft", "shift+alt+ArrowRight", "mod+Home", "End"]) {
      expect(movesCaret(combo), combo).toBe(true);
    }
    for (const combo of ["alt+mod+ArrowUp", "ctrl+mod+ArrowLeft", "ctrl+ArrowUp", "mod+b", "PageDown"]) {
      expect(movesCaret(combo), combo).toBe(false);
    }
  });
});

describe("shortcutFor", () => {
  it("shows a command's first combo", () => {
    expect(shortcutFor("toggleSidebar", true)).toBe("⌘B");
    expect(shortcutFor("newTab", true)).toBe("⌘N");
    expect(shortcutFor("newTab", false)).toBe("Ctrl+N");
    expect(shortcutFor("combineFiles", true)).toBeNull();
  });
});

describe("acceleratorFor and displayCombo", () => {
  it("builds Tauri accelerators", () => {
    expect(acceleratorFor("mod+shift+s")).toBe("Shift+CmdOrCtrl+S");
    expect(acceleratorFor("ctrl+mod+h")).toBe("Ctrl+CmdOrCtrl+H");
    expect(acceleratorFor("alt+mod+ArrowDown")).toBe("Alt+CmdOrCtrl+ArrowDown");
    expect(acceleratorFor("mod+\\")).toBe("CmdOrCtrl+Backslash");
    expect(acceleratorFor("h")).toBeNull();
    expect(acceleratorFor("F7")).toBe("F7");
    expect(acceleratorFor("ctrl+shift+-")).toBe("Ctrl+Shift+Minus");
  });

  it("formats macOS symbols in Apple's order", () => {
    expect(displayCombo("mod+shift+alt+ArrowUp", true)).toBe("⌥⇧⌘↑");
    expect(displayCombo("ctrl+mod+h", true)).toBe("⌃⌘H");
    expect(displayCombo("Escape", true)).toBe("Esc");
    expect(displayCombo("mod+shift+s", false)).toBe("Shift+Ctrl+S");
  });
});
