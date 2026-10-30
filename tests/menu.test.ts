import { describe, expect, it } from "vitest";
import { commands } from "../src/lib/commands";
import { checkedCommands, menuLayout, type MenuState } from "../src/lib/menu";

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

describe("checkedCommands", () => {
  const state: MenuState = {
    hasDocument: true,
    split: false,
    comparing: false,
    documentMap: true,
    documentMapAvailable: true,
    darkPages: false,
    invertImages: false,
    caretBrowsing: false,
    scrollMode: "wrapped",
    spreadMode: "odd",
  };

  it("checks one scroll mode and one spread mode", () => {
    expect([...checkedCommands(state)].sort()).toEqual(["scrollWrapped", "spreadOdd", "toggleDocumentMap"]);
  });

  it("clears the mode checks without a document and the map check when it can't show", () => {
    expect([...checkedCommands({ ...state, hasDocument: false, documentMapAvailable: false, caretBrowsing: true })]).toEqual(["toggleCaretBrowsing"]);
  });
});
