import { describe, expect, it } from "vitest";
import { resolveShortcut, type KeyInput } from "../src/lib/shortcuts";

const key = (value: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("resolveShortcut", () => {
  it("maps command shortcuts to the platform modifier", () => {
    expect(resolveShortcut(key("o", { metaKey: true }), true, false)).toBe("open");
    expect(resolveShortcut(key("o", { ctrlKey: true }), true, false)).toBeNull();
    expect(resolveShortcut(key("o", { ctrlKey: true }), false, false)).toBe("open");
  });

  it("distinguishes shifted command shortcuts", () => {
    expect(resolveShortcut(key("s", { metaKey: true }), true, false)).toBe("save");
    expect(resolveShortcut(key("S", { metaKey: true, shiftKey: true }), true, false)).toBe("saveAs");
    expect(resolveShortcut(key("G", { metaKey: true, shiftKey: true }), true, false)).toBe("findPrevious");
    expect(resolveShortcut(key("+", { metaKey: true, shiftKey: true }), true, false)).toBe("zoomIn");
  });

  it("allows command shortcuts while typing", () => {
    expect(resolveShortcut(key("f", { metaKey: true }), true, true)).toBe("find");
  });

  it("ignores plain keys while typing", () => {
    expect(resolveShortcut(key("h"), true, true)).toBeNull();
    expect(resolveShortcut(key("End"), true, true)).toBeNull();
  });

  it("maps plain navigation and tool keys", () => {
    expect(resolveShortcut(key("h"), true, false)).toBe("toolHighlight");
    expect(resolveShortcut(key("Home"), true, false)).toBe("firstPage");
    expect(resolveShortcut(key("j"), true, false)).toBe("nextPage");
  });

  it("ignores plain keys combined with modifiers it does not own", () => {
    expect(resolveShortcut(key("h", { shiftKey: true }), true, false)).toBeNull();
    expect(resolveShortcut(key("c", { metaKey: true }), true, false)).toBeNull();
    expect(resolveShortcut(key("s", { metaKey: true, altKey: true }), true, false)).toBeNull();
  });

  it("always resolves escape", () => {
    expect(resolveShortcut(key("Escape"), true, true)).toBe("escape");
  });
});
