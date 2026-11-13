import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_DOCUMENT_WIDTH,
  MIN_SIDEBAR_WIDTH,
  clampSidebarWidth,
  parseSidebarWidth,
  readSidebarWidth,
  writeSidebarWidth,
} from "../src/lib/sidebarWidth";

describe("clampSidebarWidth", () => {
  it("keeps a width inside the limits", () => {
    expect(clampSidebarWidth(300)).toBe(300);
    expect(clampSidebarWidth(10)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(5000)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it("rounds to whole pixels", () => {
    expect(clampSidebarWidth(250.6)).toBe(251);
  });

  it("leaves room for the document", () => {
    expect(clampSidebarWidth(500, 600)).toBe(600 - MIN_DOCUMENT_WIDTH);
  });

  it("never goes below the minimum in a narrow pane", () => {
    expect(clampSidebarWidth(300, 300)).toBe(MIN_SIDEBAR_WIDTH);
  });
});

describe("parseSidebarWidth", () => {
  it("falls back to the default for missing or bad values", () => {
    expect(parseSidebarWidth(null)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(parseSidebarWidth("wide")).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(parseSidebarWidth("Infinity")).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it("clamps stored values", () => {
    expect(parseSidebarWidth("320")).toBe(320);
    expect(parseSidebarWidth("9999")).toBe(MAX_SIDEBAR_WIDTH);
    expect(parseSidebarWidth("-4")).toBe(MIN_SIDEBAR_WIDTH);
  });
});

describe("stored width", () => {
  it("round-trips through storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    expect(readSidebarWidth(storage)).toBe(DEFAULT_SIDEBAR_WIDTH);
    writeSidebarWidth(288, storage);
    expect(readSidebarWidth(storage)).toBe(288);
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readSidebarWidth(broken)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(() => writeSidebarWidth(300, broken)).not.toThrow();
  });
});
