import { describe, expect, it } from "vitest";
import { CONTEXT_TOOLS_KEY, cleanContextTools, defaultContextTools, parseContextTools, readContextTools, toolCommand, withContextTool, writeContextTools } from "../src/lib/contextTools";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("context tools", () => {
  it("defaults to Select, Highlight, Text Note, Draw, Comments, and Sign", () => {
    expect(defaultContextTools).toEqual(["select", "highlight", "text", "draw", "comment", "signature"]);
    expect(parseContextTools(null)).toEqual(defaultContextTools);
    expect(readContextTools(memoryStorage())).toEqual(defaultContextTools);
  });

  it("falls back to the defaults for garbage", () => {
    expect(parseContextTools("not json")).toEqual(defaultContextTools);
    expect(parseContextTools('{"select":true}')).toEqual(defaultContextTools);
    expect(readContextTools(memoryStorage({ [CONTEXT_TOOLS_KEY]: "[" }))).toEqual(defaultContextTools);
  });

  it("drops unknown ids and keeps toolbar order", () => {
    expect(cleanContextTools(["draw", "lasso", 3, null, "select", "draw"])).toEqual(["select", "draw"]);
    expect(parseContextTools("[]")).toEqual([]);
  });

  it("adds and removes tools in toolbar order", () => {
    expect(withContextTool(["select", "draw"], "hand", true)).toEqual(["select", "hand", "draw"]);
    expect(withContextTool(["select", "draw"], "select", false)).toEqual(["draw"]);
    expect(withContextTool(["select"], "select", true)).toEqual(["select"]);
  });

  it("writes, reads back, and resets", () => {
    const storage = memoryStorage();
    writeContextTools(["mark", "hand"], storage);
    expect(readContextTools(storage)).toEqual(["hand", "mark"]);
    writeContextTools(null, storage);
    expect(storage.values.has(CONTEXT_TOOLS_KEY)).toBe(false);
    expect(readContextTools(storage)).toEqual(defaultContextTools);
  });

  it("maps Fill In to the last-used mark", () => {
    expect(toolCommand("mark", null)).toBe("markCheck");
    expect(toolCommand("mark", "date")).toBe("markDate");
    expect(toolCommand("signature")).toBe("sign");
    expect(toolCommand("comment")).toBe("toolComment");
  });
});
