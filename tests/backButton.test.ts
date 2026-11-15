import { describe, expect, it } from "vitest";
import { backTarget } from "../src/lib/backButton";

function scopeWith(present: Record<string, string>) {
  return { querySelector: (selector: string) => (present[selector] ? ({ id: present[selector] } as unknown as Element) : null) };
}

describe("backTarget", () => {
  it("closes an open menu before anything else", () => {
    const target = backTarget(scopeWith({ ":popover-open": "menu", "dialog[open]": "sheet" }));
    expect(target).toMatchObject({ kind: "popover", element: { id: "menu" } });
  });

  it("closes a sheet before the find bar", () => {
    const target = backTarget(scopeWith({ "dialog[open]": "sheet", ".findbar:not([inert] *)": "find" }));
    expect(target).toMatchObject({ kind: "escape", element: { id: "sheet" } });
  });

  it("closes the visible tab's find bar", () => {
    expect(backTarget(scopeWith({ ".findbar:not([inert] *)": "find" }))).toMatchObject({ kind: "escape", element: { id: "find" } });
  });

  it("leaves the app when nothing is open", () => {
    expect(backTarget(scopeWith({}))).toBeNull();
  });
});
