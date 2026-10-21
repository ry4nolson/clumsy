import { useCallback, useRef, useState } from "react";
import type { QuickPickMode } from "../components/QuickPick";
import type { CommandId } from "../lib/commands";
import { paletteItems, quickOpenItems, quickOpenTarget, rememberCommand, type OpenTab, type PaletteContext } from "../lib/quickPick";
import type { RecentEntry } from "../lib/recent";

type QuickPickSources = PaletteContext & {
  tabs: OpenTab[];
  recent: RecentEntry[];
  onCommand: (id: CommandId) => void;
  onShowTab: (tabId: string) => void;
  onOpenRecent: (entry: RecentEntry) => void;
};

type Kind = "palette" | "quickOpen";

export function useQuickPick(sources: QuickPickSources) {
  const [mode, setMode] = useState<(QuickPickMode & { kind: Kind }) | null>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const opened = useRef(0);
  const recentCommands = useRef<CommandId[]>([]);

  const toggle = useCallback((kind: Kind) => {
    setMode((current) => {
      if (current?.kind === kind) {
        return null;
      }
      const latest = sourcesRef.current;
      const key = `${kind}-${++opened.current}`;
      return kind === "palette"
        ? { kind, key, placeholder: "Type a command", empty: "No matching commands", items: paletteItems(latest, recentCommands.current) }
        : { kind, key, placeholder: "Search open and recent files", empty: "No matching files", items: quickOpenItems(latest.tabs, latest.recent) };
    });
  }, []);

  const close = useCallback(() => setMode(null), []);

  const pick = useCallback(
    (id: string) => {
      const kind = mode?.kind;
      setMode(null);
      const latest = sourcesRef.current;
      if (kind === "palette") {
        recentCommands.current = rememberCommand(recentCommands.current, id as CommandId);
        latest.onCommand(id as CommandId);
        return;
      }
      const target = quickOpenTarget(id);
      if (target?.kind === "tab") {
        latest.onShowTab(target.tabId);
      } else if (target?.kind === "recent") {
        const entry = latest.recent.find((candidate) => candidate.path === target.path);
        if (entry) {
          latest.onOpenRecent(entry);
        }
      }
    },
    [mode],
  );

  return { mode, toggle, close, pick };
}
