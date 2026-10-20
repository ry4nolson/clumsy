import { describe, expect, it } from "vitest";
import { createPaneId, createStartTab, createTabId, isModified, type DocTab } from "../src/lib/tabs";

const documentTab = (overrides: Partial<DocTab> = {}): DocTab => ({
  id: "doc",
  kind: "document",
  source: { name: "a.pdf", path: "/a.pdf", data: new Uint8Array() },
  name: "a.pdf",
  path: "/a.pdf",
  replaces: null,
  returnTo: null,
  carriedChanges: false,
  ...overrides,
});

describe("tab ids", () => {
  it("never repeats", () => {
    const ids = [createTabId(), createStartTab().id, createTabId()];
    expect(new Set(ids).size).toBe(3);
    expect(createPaneId()).not.toBe(createPaneId());
  });
});

describe("isModified", () => {
  it("is false for start tabs and missing tabs", () => {
    expect(isModified(createStartTab(), {})).toBe(false);
    expect(isModified(undefined, {})).toBe(false);
  });

  it("follows the viewer snapshot", () => {
    expect(isModified(documentTab(), { doc: { modified: false } })).toBe(false);
    expect(isModified(documentTab(), { doc: { modified: true } })).toBe(true);
  });

  it("stays modified for changes carried over from another window", () => {
    expect(isModified(documentTab({ carriedChanges: true }), {})).toBe(true);
  });
});
