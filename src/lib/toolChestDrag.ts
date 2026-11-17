import type { SavedTool } from "./toolChest";

export type DropSpot = { beforeId: string | null; group: string | null };

const sameGroup = (a: string | null, b: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export function spotNear(tools: SavedTool[], hoveredId: string, after: boolean, draggingId: string): DropSpot | null {
  const hovered = tools.find((tool) => tool.id === hoveredId);
  if (!hovered || hoveredId === draggingId) {
    return null;
  }
  if (!after) {
    return { beforeId: hoveredId, group: hovered.group };
  }
  const peers = tools.filter((tool) => tool.id !== draggingId && sameGroup(tool.group, hovered.group));
  const next = peers[peers.findIndex((tool) => tool.id === hoveredId) + 1];
  return { beforeId: next?.id ?? null, group: hovered.group };
}

export function spotAtGroup(tools: SavedTool[], group: string | null, draggingId: string): DropSpot {
  const first = tools.find((tool) => tool.id !== draggingId && sameGroup(tool.group, group));
  return { beforeId: first?.id ?? null, group: first?.group ?? group };
}

export function dropSpot(root: HTMLElement, x: number, y: number, tools: SavedTool[], draggingId: string): DropSpot | null {
  const element = document.elementFromPoint(x, y);
  if (!element || !root.contains(element)) {
    return null;
  }
  const row = element.closest<HTMLElement>("[data-tool-id]");
  if (row) {
    const box = row.getBoundingClientRect();
    return spotNear(tools, row.dataset.toolId ?? "", y > box.top + box.height / 2, draggingId);
  }
  const header = element.closest<HTMLElement>("h3[data-group]");
  return header ? spotAtGroup(tools, header.dataset.group || null, draggingId) : null;
}
