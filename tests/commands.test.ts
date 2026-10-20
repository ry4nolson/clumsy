import { describe, expect, it } from "vitest";
import { acceleratorFor, commands, comboFromEvent, displayCombo, resolveCommand, type KeyInput } from "../src/lib/commands";

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
        expect(accelerator).toMatch(/^((Ctrl|Shift|Alt|CmdOrCtrl)\+)+([A-Z0-9]|Equal|Minus|Backslash|BracketLeft|BracketRight|Slash|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Tab)$/);
      }
    }
  });
});

describe("resolveCommand", () => {
  it("uses physical keys so Option combos work", () => {
    expect(resolveCommand({ key: "ª", code: "Digit9", metaKey: true, altKey: true, ctrlKey: false, shiftKey: false }, true, false)).toBe("fitPage");
    expect(resolveCommand({ key: "©", code: "KeyG", metaKey: true, altKey: true, ctrlKey: false, shiftKey: false }, true, false)).toBe("goToPage");
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

describe("acceleratorFor and displayCombo", () => {
  it("builds Tauri accelerators", () => {
    expect(acceleratorFor("mod+shift+s")).toBe("Shift+CmdOrCtrl+S");
    expect(acceleratorFor("ctrl+mod+h")).toBe("Ctrl+CmdOrCtrl+H");
    expect(acceleratorFor("alt+mod+ArrowDown")).toBe("Alt+CmdOrCtrl+ArrowDown");
    expect(acceleratorFor("mod+\\")).toBe("CmdOrCtrl+Backslash");
    expect(acceleratorFor("h")).toBeNull();
  });

  it("formats macOS symbols in Apple's order", () => {
    expect(displayCombo("mod+shift+alt+ArrowUp", true)).toBe("⌥⇧⌘↑");
    expect(displayCombo("ctrl+mod+h", true)).toBe("⌃⌘H");
    expect(displayCombo("Escape", true)).toBe("Esc");
    expect(displayCombo("mod+shift+s", false)).toBe("Shift+Ctrl+S");
  });
});
