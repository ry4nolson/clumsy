import { describe, expect, it } from "vitest";
import { newMarkup, withPreset } from "../src/lib/markup";
import { MARKUP_PARAMS_KEY } from "../src/lib/markupParams";
import {
  TOOL_CHEST_KEY,
  armSpec,
  cleanTool,
  cleanToolChest,
  newTool,
  parseToolChest,
  parseToolRef,
  readToolChest,
  starterTools,
  toolOfMarkup,
  toolRef,
  writeToolChest,
  type SavedTool,
} from "../src/lib/toolChest";
import { addedTool, chestFileText, duplicatedTool, groupOnly, importClashes, mergedChest, movedTool, removedTool, restoredTool, toolGroups, toolSections } from "../src/lib/toolChestEdit";
import { spotAtGroup, spotNear } from "../src/lib/toolChestDrag";
import { swatchMarkup } from "../src/lib/toolSwatch";

const style = { color: "#1565c0", fill: false, width: 2, opacity: 1, dash: null };
const tool = (id: string, name: string, group: string | null, ref = "shape:rectangle"): SavedTool => ({ id, name, group, tool: ref, style: { ...style } });
const chestOf = (...tools: SavedTool[]) => ({ version: 1, tools });

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), values };
}

describe("tool refs", () => {
  it("round-trips every kind and refuses unknown ones", () => {
    for (const ref of ["shape:cloud", "stamp:review:approved", "stamp:elec:receptacle-duplex", "text:underline", "measure:area", "highlight", "draw", "text"]) {
      expect(toolRef(parseToolRef(ref)!)).toBe(ref);
    }
    for (const ref of ["shape:hexagon", "stamp:made-up", "text:bold", "measure:volume", "lasso", "", 4, null]) {
      expect(parseToolRef(ref)).toBeNull();
    }
  });
});

describe("cleaning", () => {
  it("drops garbage, unknown tools, and unknown stamps without throwing", () => {
    expect(cleanToolChest(null).tools).toEqual([]);
    expect(cleanToolChest({ tools: "nope" }).tools).toEqual([]);
    const chest = cleanToolChest({
      version: 7,
      tools: [
        tool("a", "Keep", null),
        { ...tool("b", "Unknown kind", null), tool: "shape:hexagon" },
        { ...tool("c", "Unknown stamp", null), tool: "stamp:renamed-symbol" },
        { ...tool("d", "   ", null) },
        { ...tool("", "No id", null) },
        tool("a", "Duplicate id", null),
        "string",
      ],
    });
    expect(chest.version).toBe(1);
    expect(chest.tools.map((entry) => entry.name)).toEqual(["Keep"]);
  });

  it("clamps styles to what each tool can do", () => {
    const shape = cleanTool({ ...tool("a", "  Wide   one ", "  Electrical "), style: { color: "#ABCDEF", fill: true, width: 99, opacity: -1, dash: [4, "x"] } })!;
    expect(shape).toMatchObject({ name: "Wide one", group: "Electrical", style: { color: "#abcdef", fill: true, width: 12, opacity: 0.1, dash: null } });
    const line = cleanTool({ ...tool("b", "Line", null, "shape:line"), style: { color: "red", fill: true, width: 0.1, dash: [4, 3] } })!;
    expect(line.style).toEqual({ color: "#e5484d", fill: false, width: 0.5, opacity: 1, dash: [4, 3] });
    const stamp = cleanTool({ ...tool("c", "Approved", null, "stamp:review:approved"), style: { width: 5, dash: [1] } })!;
    expect(stamp.style).toMatchObject({ width: 0, dash: null });
    const ink = cleanTool({ ...tool("d", "Ink", null, "draw"), style: { width: 50, opacity: 0.01 } })!;
    expect(ink.style).toMatchObject({ width: 20, opacity: 0.05 });
    const text = cleanTool({ ...tool("e", "Note", null, "text"), style: { width: 200, opacity: 0.2 } })!;
    expect(text.style).toMatchObject({ width: 100, opacity: 1 });
  });

  it("keeps a measure format only for measure tools, and fits it to its unit", () => {
    expect(cleanTool({ ...tool("a", "Area", null, "measure:area"), measure: { unit: "m", precision: 64 } })!.measure).toEqual({ unit: "m", precision: 2 });
    expect(cleanTool({ ...tool("a", "Area", null, "measure:area") })!.measure).toBeUndefined();
    expect(cleanTool({ ...tool("b", "Box", null), measure: { unit: "m", precision: 2 } })!.measure).toBeUndefined();
  });

  it("starts with the starter set and treats a broken value as empty", () => {
    expect(parseToolChest(null).tools.map((entry) => entry.id)).toEqual(starterTools.map((entry) => entry.id));
    expect(cleanToolChest({ tools: starterTools }).tools).toHaveLength(starterTools.length);
    expect(parseToolChest("{not json").tools).toEqual([]);
    expect(parseToolChest(JSON.stringify({ version: 1, tools: [] })).tools).toEqual([]);
  });

  it("writes and reads through storage without touching the everyday markup style", () => {
    const store = memoryStore({ [MARKUP_PARAMS_KEY]: '{"color":"#000000"}' });
    expect(readToolChest(store).tools).toHaveLength(starterTools.length);
    expect(writeToolChest(chestOf(tool("a", "Drywall", "Walls")), store)).toBe(true);
    expect(readToolChest(store).tools.map((entry) => entry.name)).toEqual(["Drywall"]);
    expect(JSON.parse(store.values.get(TOOL_CHEST_KEY)!).version).toBe(1);
    expect(store.values.get(MARKUP_PARAMS_KEY)).toBe('{"color":"#000000"}');
  });
});

describe("making tools", () => {
  const markupStyle = { color: [1, 0, 0], fill: true, width: 3, opacity: 0.5 };

  it("captures a markup's kind, style, and subject", () => {
    const cloud = newMarkup({ id: "m", pageIndex: 0, kind: "cloud", box: [0, 0, 10, 10], subject: "Rev 3", dash: [3, 2] }, markupStyle, "");
    expect(toolOfMarkup(cloud, "new")).toEqual({ id: "new", name: "Rev 3", group: null, tool: "shape:cloud", style: { color: "#ff0000", fill: true, width: 3, opacity: 0.5, dash: [3, 2] } });
    const stamp = newMarkup({ id: "s", pageIndex: 0, kind: "stamp", box: [0, 0, 10, 10], stamp: "elec:receptacle-duplex", width: 0 }, markupStyle, "");
    expect(toolOfMarkup(stamp, "new")).toMatchObject({ name: "Duplex Receptacle", tool: "stamp:elec:receptacle-duplex" });
    const unknown = newMarkup({ id: "u", pageIndex: 0, kind: "stamp", box: [0, 0, 10, 10], stamp: "Approved" }, markupStyle, "");
    expect(toolOfMarkup(unknown, "new")).toBeNull();
    const area = newMarkup({ id: "a", pageIndex: 0, kind: "measure-area", box: [0, 0, 10, 10], measure: { scale: { label: "", inchesPerPoint: 1 }, format: { unit: "ft", precision: 1 } } }, markupStyle, "");
    expect(toolOfMarkup(area, "new")).toMatchObject({ name: "Area", tool: "measure:area", measure: { unit: "ft", precision: 1 } });
  });

  it("arms markup tools with a preset and pdf.js tools with their own params", () => {
    const drywall = newTool("t", { kind: "measure", measure: "measure-area" }, { name: "Drywall", style: { color: "#1565c0", fill: true }, measure: { unit: "ft-in", precision: 8 } })!;
    expect(armSpec(drywall)).toEqual({
      kind: "markup",
      target: { kind: "measure", measure: "measure-area" },
      preset: { id: "t", name: "Drywall", style: { color: [0x15 / 255, 0x65 / 255, 0xc0 / 255], fill: true, width: 2, opacity: 1 }, dash: null, format: { unit: "ft-in", precision: 8 } },
    });
    const marker = newTool("h", { kind: "editor", editor: "highlight" }, { name: "Spec", style: { color: "#53ffbc" } })!;
    expect(armSpec(marker)).toEqual({ kind: "editor", editor: "highlight", color: "#53ffbc", width: 12, opacity: 1 });
  });

  it("names markup after the preset and gives it the preset's dash", () => {
    const preset = { id: "t", name: "Conduit run", style: { color: [1, 0, 0], fill: false, width: 2, opacity: 1 }, dash: [4, 3], format: null };
    const line = newMarkup({ id: "m", pageIndex: 0, kind: "measure-length", box: [0, 0, 10, 0] }, preset.style, "");
    expect(withPreset(line, preset)).toMatchObject({ subject: "Conduit run", dash: [4, 3] });
    const underline = newMarkup({ id: "u", pageIndex: 0, kind: "underline", box: [0, 0, 10, 2] }, preset.style, "");
    expect(withPreset(underline, preset)).toMatchObject({ subject: "Conduit run", dash: null });
    expect(withPreset(line, undefined)).toBe(line);
  });

  it("draws a swatch for every starter tool", () => {
    for (const starter of starterTools) {
      const markup = swatchMarkup(starter);
      expect(markup === null).toBe(starter.tool === "highlight");
    }
    expect(swatchMarkup(starterTools[0])?.color).toEqual([0.13, 0.55, 0.25]);
  });
});

describe("editing the chest", () => {
  const a = tool("a", "Type A", "Lighting");
  const b = tool("b", "Type B", "Lighting");
  const c = tool("c", "Drywall", "Walls");
  const d = tool("d", "Loose", null);

  it("groups tools in order of first appearance", () => {
    const sections = toolSections([a, c, b, d]);
    expect(sections.map((section) => [section.group, section.tools.map((entry) => entry.id)])).toEqual([
      ["Lighting", ["a", "b"]],
      ["Walls", ["c"]],
      [null, ["d"]],
    ]);
    expect(toolGroups([a, c, { ...b, group: "lighting" }, d])).toEqual(["Lighting", "Walls"]);
  });

  it("moves within and between groups", () => {
    const chest = chestOf(a, b, c, d);
    expect(movedTool(chest, "b", "a", "Lighting").tools.map((entry) => entry.id)).toEqual(["b", "a", "c", "d"]);
    const moved = movedTool(chest, "a", null, "Walls").tools;
    expect(moved.map((entry) => entry.id)).toEqual(["b", "c", "a", "d"]);
    expect(moved.find((entry) => entry.id === "a")?.group).toBe("Walls");
    expect(movedTool(chest, "d", null, "New").tools.map((entry) => [entry.id, entry.group])).toEqual([["a", "Lighting"], ["b", "Lighting"], ["c", "Walls"], ["d", "New"]]);
    expect(movedTool(chest, "a", "a", "Lighting")).toBe(chest);
  });

  it("works out where a dragged tool lands", () => {
    const tools = [a, b, c, d];
    expect(spotNear(tools, "b", false, "c")).toEqual({ beforeId: "b", group: "Lighting" });
    expect(spotNear(tools, "b", true, "c")).toEqual({ beforeId: null, group: "Lighting" });
    expect(spotNear(tools, "a", true, "c")).toEqual({ beforeId: "b", group: "Lighting" });
    expect(spotNear(tools, "a", true, "b")).toEqual({ beforeId: null, group: "Lighting" });
    expect(spotNear(tools, "a", false, "a")).toBeNull();
    expect(spotAtGroup(tools, "walls", "a")).toEqual({ beforeId: "c", group: "Walls" });
    expect(spotAtGroup(tools, "Empty", "a")).toEqual({ beforeId: null, group: "Empty" });
  });

  it("removes and restores in place, and duplicates next to the original", () => {
    const chest = chestOf(a, b, c);
    const { chest: without, removal } = removedTool(chest, "b");
    expect(without.tools.map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(restoredTool(without, removal!).tools.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(removedTool(chest, "zzz").removal).toBeNull();
    const copied = duplicatedTool(chest, "a", "a2").tools;
    expect(copied.map((entry) => [entry.id, entry.name])).toEqual([["a", "Type A"], ["a2", "Type A copy"], ["b", "Type B"], ["c", "Drywall"]]);
    expect(addedTool(chest, { ...a, name: "Renamed" }).tools.map((entry) => entry.name)).toEqual(["Type B", "Drywall", "Renamed"]);
  });

  it("exports one group or all of it as versioned JSON", () => {
    expect(groupOnly(chestOf(a, b, c, d), "lighting").tools.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(groupOnly(chestOf(a, b, c, d), null).tools.map((entry) => entry.id)).toEqual(["d"]);
    const text = chestFileText(chestOf(a));
    expect(JSON.parse(text)).toEqual({ version: 1, tools: [a] });
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("importing", () => {
  const mine = chestOf(tool("a", "Type A", "Lighting"), tool("b", "Drywall", "Walls"));

  it("replaces the same id, adds new ones, and finds name clashes within a group", () => {
    const incoming = chestOf({ ...tool("a", "Type A v2", "Lighting") }, tool("x", "drywall", "walls"), tool("y", "Drywall", "Other"), tool("z", "New", null));
    expect(importClashes(mine, incoming).map((entry) => entry.id)).toEqual(["x"]);
    const kept = mergedChest(mine, incoming, "keepBoth");
    expect(kept.chest.tools.map((entry) => [entry.id, entry.name])).toEqual([["a", "Type A v2"], ["b", "Drywall"], ["x", "drywall"], ["y", "Drywall"], ["z", "New"]]);
    expect([kept.added, kept.replaced]).toEqual([3, 1]);
    const replaced = mergedChest(mine, incoming, "replace");
    expect(replaced.chest.tools.map((entry) => [entry.id, entry.group])).toEqual([["a", "Lighting"], ["x", "walls"], ["y", "Other"], ["z", null]]);
    expect([replaced.added, replaced.replaced]).toEqual([2, 2]);
  });

  it("cleans what it imports", () => {
    const merged = mergedChest(mine, { version: 99, tools: [{ ...tool("q", "Bad", null), tool: "stamp:gone" }, tool("r", "Good", null)] } as never, "keepBoth");
    expect(merged.chest.tools.map((entry) => entry.id)).toEqual(["a", "b", "r"]);
  });
});
