import { describe, expect, it } from "vitest";
import { commands } from "../src/lib/commands";
import { menuLayout } from "../src/lib/menu";

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
