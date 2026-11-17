export type OrderItem = string | OrderItem[] | { name: string | null; order: OrderItem[] };

export type LayerGroup = { name: string; visible: boolean };

export type LayerNode = { kind: "layer"; id: string; name: string; visible: boolean } | { kind: "label"; name: string; children: LayerNode[] };

export type SavedLayer = { id: string; name: string; visible: boolean };

const MAX_DEPTH = 32;

export function layerTree(order: OrderItem[] | null, groupOf: (id: string) => LayerGroup | null): LayerNode[] {
  const seen = new Set<string>();
  const walk = (items: OrderItem[], depth: number): LayerNode[] => {
    if (depth > MAX_DEPTH) {
      return [];
    }
    const nodes: LayerNode[] = [];
    for (const item of items) {
      if (typeof item === "string") {
        const group = seen.has(item) ? null : groupOf(item);
        if (group) {
          seen.add(item);
          nodes.push({ kind: "layer", id: item, name: group.name.trim() || "Untitled layer", visible: group.visible });
        }
      } else {
        const [name, children] = Array.isArray(item) ? [null, item] : [item.name?.trim() || null, item.order];
        const inner = walk(Array.isArray(children) ? children : [], depth + 1);
        if (name === null) {
          nodes.push(...inner);
        } else if (inner.length) {
          nodes.push({ kind: "label", name, children: inner });
        }
      }
    }
    return nodes;
  };
  return walk(order ?? [], 0);
}

export function countLayers(nodes: LayerNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.kind === "layer" ? 1 : countLayers(node.children)), 0);
}

export function layerIds(nodes: LayerNode[]): string[] {
  return nodes.flatMap((node) => (node.kind === "layer" ? [node.id] : layerIds(node.children)));
}

export function changedLayers(initial: Map<string, boolean>, groups: Iterable<[string, LayerGroup]>): SavedLayer[] {
  const changed: SavedLayer[] = [];
  for (const [id, group] of groups) {
    if (initial.has(id) && initial.get(id) !== group.visible) {
      changed.push({ id, name: group.name, visible: group.visible });
    }
  }
  return changed;
}

export function restoreLayers(saved: SavedLayer[] | undefined, groups: Iterable<[string, LayerGroup]>): Array<[string, boolean]> {
  if (!saved?.length) {
    return [];
  }
  const list = [...groups];
  const byId = new Map(list);
  const idsByName = new Map<string, string[]>();
  for (const [id, group] of list) {
    idsByName.set(group.name, [...(idsByName.get(group.name) ?? []), id]);
  }
  const applied: Array<[string, boolean]> = [];
  for (const { id, name, visible } of saved) {
    const named = idsByName.get(name);
    const target = byId.get(id)?.name === name ? id : named?.length === 1 ? named[0] : null;
    if (target && !applied.some(([applying]) => applying === target)) {
      applied.push([target, visible]);
    }
  }
  return applied;
}

export function parseSavedLayers(value: unknown): SavedLayer[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const layers = value.filter(
    (entry): entry is SavedLayer =>
      typeof entry === "object" && entry !== null && typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.visible === "boolean",
  );
  return layers.length ? layers : undefined;
}
