import { describe, expect, it } from "vitest";
import { adjustHidden, UNHIDE_MARGIN } from "../src/lib/toolbarOverflow";

describe("adjustHidden", () => {
  const widths = [100, 32, 32, 60];

  it("hides nothing while everything fits", () => {
    expect(adjustHidden(0, 0, widths, 32)).toBe(0);
    expect(adjustHidden(0, 500, widths, 32)).toBe(0);
  });

  it("hides items in order until the overflow and the menu button fit", () => {
    expect(adjustHidden(0, -10, widths, 32)).toBe(1);
    expect(adjustHidden(0, -80, widths, 32)).toBe(2);
    expect(adjustHidden(1, -40, widths, 32)).toBe(3);
  });

  it("stops at the last item when nothing more can go", () => {
    expect(adjustHidden(0, -10_000, widths, 32)).toBe(widths.length);
    expect(adjustHidden(0, -10, [], 32)).toBe(0);
  });

  it("shows items again only when they fit with a margin", () => {
    expect(adjustHidden(3, 32 + UNHIDE_MARGIN - 1, widths, 32)).toBe(3);
    expect(adjustHidden(3, 32 + UNHIDE_MARGIN, widths, 32)).toBe(2);
    expect(adjustHidden(3, 1000, widths, 32)).toBe(0);
  });

  it("counts the menu button as freed when the last hidden item comes back", () => {
    expect(adjustHidden(1, 100 - 32 + UNHIDE_MARGIN, widths, 32)).toBe(0);
    expect(adjustHidden(1, 100 - 32 + UNHIDE_MARGIN - 1, widths, 32)).toBe(1);
  });

  it("is stable after hiding: the new slack never shows the item again", () => {
    const hidden = adjustHidden(0, -10, widths, 32);
    expect(adjustHidden(hidden, -10 + widths[0] - 32, widths, 32)).toBe(hidden);
  });

  it("clamps a count left over from a longer list", () => {
    expect(adjustHidden(9, -5, widths, 32)).toBe(widths.length);
  });
});
