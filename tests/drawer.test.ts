import { describe, expect, it } from "vitest";
import { sidebarFits } from "../src/lib/drawer";

describe("sidebarFits", () => {
  it("keeps the sidebar beside the page on tablets and desktops", () => {
    expect(sidebarFits(1280)).toBe(true);
    expect(sidebarFits(700)).toBe(true);
  });

  it("starts with the sidebar closed on a phone", () => {
    expect(sidebarFits(412)).toBe(false);
  });
});
