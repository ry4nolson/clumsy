import { describe, expect, it } from "vitest";
import { canReload, looksComplete } from "../src/lib/externalChanges";
import type { DocTab } from "../src/lib/tabs";

const tab = (overrides: Partial<DocTab> = {}): DocTab => ({
  id: "doc",
  kind: "document",
  source: { name: "a.pdf", path: "/a.pdf", data: new Uint8Array() },
  name: "a.pdf",
  path: "/a.pdf",
  replaces: null,
  returnTo: null,
  carriedChanges: false,
  stamp: "100-5",
  ...overrides,
});

const clean = { loaded: true, modified: false, tool: "select" };

describe("canReload", () => {
  it("reloads an unedited document whose file changed", () => {
    expect(canReload(tab(), clean, "200-6")).toBe(true);
    expect(canReload(tab(), { ...clean, tool: "highlight" }, "200-6")).toBe(true);
  });

  it("ignores unchanged, missing, or unknown files", () => {
    expect(canReload(tab(), clean, "100-5")).toBe(false);
    expect(canReload(tab(), clean, null)).toBe(false);
    expect(canReload(tab({ stamp: null }), clean, "200-6")).toBe(false);
    expect(canReload(tab({ path: null }), clean, "200-6")).toBe(false);
  });

  it("never throws away edits", () => {
    expect(canReload(tab(), { ...clean, modified: true }, "200-6")).toBe(false);
    expect(canReload(tab({ carriedChanges: true }), clean, "200-6")).toBe(false);
    expect(canReload(tab(), { ...clean, tool: "draw" }, "200-6")).toBe(false);
    expect(canReload(tab(), { ...clean, tool: "text" }, "200-6")).toBe(false);
  });

  it("waits for the document to finish loading", () => {
    expect(canReload(tab(), { ...clean, loaded: false }, "200-6")).toBe(false);
    expect(canReload(tab(), undefined, "200-6")).toBe(false);
  });
});

describe("looksComplete", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("accepts a file ending in an EOF marker", () => {
    expect(looksComplete(bytes("%PDF-1.7\n...\n%%EOF\n"))).toBe(true);
  });

  it("rejects a file that is still being written", () => {
    expect(looksComplete(bytes("%PDF-1.7\n1 0 obj"))).toBe(false);
    expect(looksComplete(new Uint8Array())).toBe(false);
  });
});
