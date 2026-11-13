import { describe, expect, it } from "vitest";
import { commands } from "../src/lib/commands";
import { checkedCommands, menuLayout, visibleSlots, type MenuState } from "../src/lib/menu";

describe("menu layout", () => {
  const placed = menuLayout.flatMap(([menu, slots]) =>
    slots.filter((slot): slot is (typeof commands)[number]["id"] => typeof slot === "string" && slot !== "-" && slot !== "recent").map((id) => ({ menu, id })),
  );

  it("places every menu command exactly once, in its own menu", () => {
    for (const command of commands.filter((candidate) => candidate.menu)) {
      const matches = placed.filter((entry) => entry.id === command.id);
      expect(matches, command.id).toHaveLength(1);
      expect(matches[0].menu, command.id).toBe(command.menu);
    }
  });

  it("only references known commands", () => {
    const known = new Set(commands.map((command) => command.id));
    for (const entry of placed) {
      expect(known.has(entry.id), entry.id).toBe(true);
    }
  });
});

describe("visibleSlots", () => {
  const slotsOf = (name: string) => menuLayout.find(([menu]) => menu === name)![1];

  it("shows the print commands where the platform can print", () => {
    expect(visibleSlots(slotsOf("File"), { canPrint: true }).slice(-6)).toEqual(["revealInFinder", "-", "setPassword", "removePassword", "-", "print"]);
    expect(visibleSlots(slotsOf("Pages"), { canPrint: true })).toContain("printSelectedPages");
  });

  it("drops them, and the separators they leave behind, where it can't", () => {
    expect(visibleSlots(slotsOf("File"), {}).slice(-4)).toEqual(["revealInFinder", "-", "setPassword", "removePassword"]);
    expect(visibleSlots(slotsOf("Pages"), {})).not.toContain("printSelectedPages");
    expect(visibleSlots(["-", "print", "-", "-", "open", "-", "printSelectedPages", "-"], {})).toEqual(["open"]);
  });

  it("shows the digital signature commands only where the platform can sign", () => {
    const signing = ["signDigitally", "certifyDocument", "addValidationData", "sealWithTimestamp"];
    expect(visibleSlots(slotsOf("Tools"), { canSignDigitally: true })).toEqual(expect.arrayContaining(signing));
    const without = visibleSlots(slotsOf("Tools"), {});
    expect(without.filter((slot) => signing.includes(slot as string))).toEqual([]);
    expect(without.filter((slot, index) => slot === "-" && without[index + 1] === "-")).toEqual([]);
  });

  it("keeps only the editing items a popup menu can run", () => {
    expect(visibleSlots(slotsOf("Clumsy"), {}, true)).toEqual(["about", "checkUpdates", "makeDefault", "makeDefaultMarkdown", "-", "quit"]);
    expect(visibleSlots(slotsOf("Window"), {}, true)).toEqual(["nextTab", "previousTab", "-", "focusLeftPane", "focusRightPane", "moveTabLeft", "moveTabRight", "moveTabToNewWindow"]);
    expect(visibleSlots(slotsOf("View"), {}, true).at(-1)).toBe("toggleFormScripts");
    expect(visibleSlots(slotsOf("Edit"), {}, true)).toEqual(slotsOf("Edit"));
  });

  it("leaves every other menu as laid out", () => {
    for (const [menu, slots] of menuLayout.filter(([name]) => !["File", "Pages", "Tools"].includes(name))) {
      expect(visibleSlots(slots, {}), menu).toEqual(slots);
    }
  });
});

describe("checkedCommands", () => {
  const state: MenuState = {
    hasDocument: true,
    hasMarkdown: false,
    markdownSource: false,
    split: false,
    comparing: false,
    documentMap: true,
    documentMapAvailable: true,
    darkPages: false,
    invertImages: false,
    caretBrowsing: false,
    hasForm: false,
    isProtected: false,
    fieldHighlights: false,
    scrollMode: "wrapped",
    spreadMode: "odd",
  };

  it("checks one scroll mode and one spread mode", () => {
    expect([...checkedCommands(state)].sort()).toEqual(["scrollWrapped", "spreadOdd", "toggleDocumentMap"]);
  });

  it("clears the mode checks without a document and the map check when it can't show", () => {
    expect([...checkedCommands({ ...state, hasDocument: false, documentMapAvailable: false, caretBrowsing: true })]).toEqual(["toggleCaretBrowsing"]);
  });

  it("checks Markdown Source only while a Markdown tab shows its source", () => {
    expect(checkedCommands({ ...state, markdownSource: true }).has("toggleMarkdownSource")).toBe(false);
    expect(checkedCommands({ ...state, hasMarkdown: true, markdownSource: true }).has("toggleMarkdownSource")).toBe(true);
    expect(checkedCommands({ ...state, hasMarkdown: true }).has("toggleMarkdownSource")).toBe(false);
  });
});
