import { commands, displayCombo, type CommandId } from "./commands";
import { hasCustomLabels, pageFromInput, pageLabelOf } from "./pageLabels";
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

export type PageTargets = { labels: string[] | null; count: number };

export function pageJumpItem(query: string, { labels, count }: PageTargets): QuickPickItem | null {
  if (!query.startsWith(":") || count < 1) {
    return null;
  }
  const text = query.slice(1).trim();
  const labeled = hasCustomLabels(labels);
  if (!text) {
    return { id: "page:", label: `Type a page number${labeled ? " or label" : ""} (1–${count})` };
  }
  const page = pageFromInput(text, labels, count);
  if (!page) {
    return { id: "page:", label: `No page “${text}”` };
  }
  const label = pageLabelOf(labels, page);
  return { id: `page:${page}`, label: labeled && label !== String(page) ? `Go to page ${label} (${page} of ${count})` : `Go to page ${page} of ${count}` };
}

export function pageJumpTarget(id: string) {
  const page = id.startsWith("page:") ? Number(id.slice(5)) : 0;
  return page > 0 ? page : null;
}
