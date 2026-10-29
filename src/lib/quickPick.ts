import { commands, displayCombo, type CommandId } from "./commands";
import type { RecentEntry } from "./recent";

export type QuickPickItem = { id: string; label: string; detail?: string; hint?: string | null };

export type PaletteContext = { hasDocument: boolean; split: boolean; comparing: boolean; isMac: boolean };

const hiddenFromPalette = new Set<CommandId>(["escape", "commandPalette"]);

export function paletteItems({ hasDocument, split, comparing, isMac }: PaletteContext, recentIds: CommandId[] = []): QuickPickItem[] {
  const rank = (id: CommandId, menu: string | null) => {
    const recent = recentIds.indexOf(id);
    return recent >= 0 ? recent - recentIds.length : menu === "Clumsy" ? 1 : 0;
  };
  return commands
    .filter((command) => command.menu && !hiddenFromPalette.has(command.id))
    .filter((command) => (hasDocument || !command.needsDocument) && (split || !command.needsSplit) && (comparing || !command.needsComparison))
    .map((command, order) => ({ command, order, rank: rank(command.id, command.menu) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map(({ command }) => ({
      id: command.id,
      label: `${command.menu}: ${command.label.replace(/…$/, "")}`,
      hint: command.combos[0] ? displayCombo(command.combos[0], isMac) : null,
    }));
}

export const RECENT_COMMAND_LIMIT = 5;

export function rememberCommand(recentIds: CommandId[], id: CommandId) {
  return [id, ...recentIds.filter((candidate) => candidate !== id)].slice(0, RECENT_COMMAND_LIMIT);
}

export type OpenTab = { id: string; name: string; path: string | null };

const parentFolder = (path: string) => path.replace(/[/\\][^/\\]*$/, "") || "/";

export function quickOpenItems(tabs: OpenTab[], recent: RecentEntry[]): QuickPickItem[] {
  const locations = new Map(recent.map((entry) => [entry.path, entry.location]));
  const openPaths = new Set(tabs.flatMap((tab) => (tab.path ? [tab.path] : [])));
  const tabItems = tabs.map((tab) => ({
    id: `tab:${tab.id}`,
    label: tab.name,
    detail: tab.path ? (locations.get(tab.path) ?? parentFolder(tab.path)) : "Not saved yet",
    hint: "open",
  }));
  const recentItems = recent
    .filter((entry) => entry.exists && !openPaths.has(entry.path))
    .map((entry) => ({ id: `recent:${entry.path}`, label: entry.name, detail: entry.location }));
  return [...tabItems, ...recentItems];
}

export type QuickOpenTarget = { kind: "tab"; tabId: string } | { kind: "recent"; path: string };

export function quickOpenTarget(id: string): QuickOpenTarget | null {
  if (id.startsWith("tab:")) {
    return { kind: "tab", tabId: id.slice(4) };
  }
  if (id.startsWith("recent:")) {
    return { kind: "recent", path: id.slice(7) };
  }
  return null;
}
