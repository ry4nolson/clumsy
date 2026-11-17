import { MAX_SAVED_TOOLS, cleanToolChest, type SavedTool, type ToolChest } from "./toolChest";

export type ToolSection = { group: string | null; tools: SavedTool[] };

const withTools = (chest: ToolChest, tools: SavedTool[]): ToolChest => ({ ...chest, tools });

const sameText = (a: string | null, b: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export function toolSections(tools: SavedTool[]): ToolSection[] {
  const sections: ToolSection[] = [];
  for (const tool of tools) {
    const section = sections.find((candidate) => sameText(candidate.group, tool.group));
    if (section) {
      section.tools.push(tool);
    } else {
      sections.push({ group: tool.group, tools: [tool] });
    }
  }
  return sections;
}

export const toolGroups = (tools: SavedTool[]) => toolSections(tools).flatMap((section) => (section.group ? [section.group] : []));

export function addedTool(chest: ToolChest, tool: SavedTool): ToolChest {
  if (chest.tools.length >= MAX_SAVED_TOOLS) {
    return chest;
  }
  return withTools(chest, [...chest.tools.filter((entry) => entry.id !== tool.id), tool]);
}

export const updatedTool = (chest: ToolChest, tool: SavedTool): ToolChest => withTools(chest, chest.tools.map((entry) => (entry.id === tool.id ? tool : entry)));

export function duplicatedTool(chest: ToolChest, id: string, newId: string): ToolChest {
  const index = chest.tools.findIndex((tool) => tool.id === id);
  if (index < 0 || chest.tools.length >= MAX_SAVED_TOOLS) {
    return chest;
  }
  const original = chest.tools[index];
  const copy = { ...original, id: newId, name: `${original.name} copy`.slice(0, 80), style: { ...original.style } };
  return withTools(chest, [...chest.tools.slice(0, index + 1), copy, ...chest.tools.slice(index + 1)]);
}

export type Removal = { tool: SavedTool; index: number };

export function removedTool(chest: ToolChest, id: string): { chest: ToolChest; removal: Removal | null } {
  const index = chest.tools.findIndex((tool) => tool.id === id);
  if (index < 0) {
    return { chest, removal: null };
  }
  return { chest: withTools(chest, chest.tools.filter((tool) => tool.id !== id)), removal: { tool: chest.tools[index], index } };
}

export function restoredTool(chest: ToolChest, { tool, index }: Removal): ToolChest {
  const tools = chest.tools.filter((entry) => entry.id !== tool.id);
  return withTools(chest, [...tools.slice(0, index), tool, ...tools.slice(index)]);
}

export function movedTool(chest: ToolChest, id: string, beforeId: string | null, group: string | null): ToolChest {
  const moving = chest.tools.find((tool) => tool.id === id);
  if (!moving || beforeId === id) {
    return chest;
  }
  const rest = chest.tools.filter((tool) => tool.id !== id);
  const moved = { ...moving, group };
  const before = beforeId === null ? -1 : rest.findIndex((tool) => tool.id === beforeId);
  if (before >= 0) {
    return withTools(chest, [...rest.slice(0, before), moved, ...rest.slice(before)]);
  }
  const last = rest.map((tool) => sameText(tool.group, group)).lastIndexOf(true);
  const at = last >= 0 ? last + 1 : rest.length;
  return withTools(chest, [...rest.slice(0, at), moved, ...rest.slice(at)]);
}

export const renamedGroup = (chest: ToolChest, from: string | null, to: string | null): ToolChest =>
  withTools(chest, chest.tools.map((tool) => (sameText(tool.group, from) ? { ...tool, group: to } : tool)));

export const groupOnly = (chest: ToolChest, group: string | null): ToolChest => withTools(chest, chest.tools.filter((tool) => sameText(tool.group, group)));

const looksSame = (a: SavedTool, b: SavedTool) =>
  JSON.stringify([a.name, a.group, a.tool, a.style, a.measure ?? null]) === JSON.stringify([b.name, b.group, b.tool, b.style, b.measure ?? null]);

const sameNameAndGroup = (a: SavedTool, b: SavedTool) => sameText(a.name, b.name) && sameText(a.group, b.group);

export function importClashes(current: ToolChest, incoming: ToolChest) {
  return cleanToolChest(incoming).tools.filter((tool) => {
    const twin = current.tools.find((existing) => existing.id === tool.id);
    return twin ? !looksSame(twin, tool) : current.tools.some((existing) => sameNameAndGroup(existing, tool));
  });
}

export const withMissing = (current: ToolChest, extra: ToolChest): ToolChest =>
  withTools(current, [...current.tools, ...extra.tools.filter((tool) => !current.tools.some((existing) => existing.id === tool.id))].slice(0, MAX_SAVED_TOOLS));

export type ClashChoice = "replace" | "keepBoth";

export function mergedChest(current: ToolChest, incoming: ToolChest, choice: ClashChoice, freshId: () => string = () => crypto.randomUUID()) {
  const tools = [...current.tools];
  const taken = new Set<string>();
  let added = 0;
  let replaced = 0;
  const add = (tool: SavedTool) => {
    if (tools.length < MAX_SAVED_TOOLS) {
      tools.push(tool);
      taken.add(tool.id);
      added++;
    }
  };
  const replaceAt = (index: number, tool: SavedTool) => {
    tools[index] = { ...tool, id: tools[index].id };
    taken.add(tools[index].id);
    replaced++;
  };
  for (const tool of cleanToolChest(incoming).tools) {
    const sameId = tools.findIndex((existing) => existing.id === tool.id);
    if (sameId >= 0) {
      if (looksSame(tools[sameId], tool)) {
        taken.add(tool.id);
      } else if (choice === "replace" && !taken.has(tool.id)) {
        replaceAt(sameId, tool);
      } else {
        add({ ...tool, id: freshId() });
      }
      continue;
    }
    const sameName = choice === "replace" ? tools.findIndex((existing) => !taken.has(existing.id) && sameNameAndGroup(existing, tool)) : -1;
    if (sameName >= 0) {
      replaceAt(sameName, tool);
    } else {
      add(tool);
    }
  }
  return { chest: withTools(current, tools), added, replaced };
}

export const chestFileText = (chest: ToolChest) => `${JSON.stringify(cleanToolChest(chest), null, 2)}\n`;
