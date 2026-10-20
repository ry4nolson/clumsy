import { useEffect, useRef, useState } from "react";
import type { CommandId } from "../lib/commands";
import { onWindowFocused } from "../lib/documentWindows";
import { installAppMenu, type AppMenu, type MenuState } from "../lib/menu";
import { clearRecentFiles, isDesktop } from "../lib/platform";
import type { RecentEntry } from "../lib/recent";

type AppMenuCallbacks = {
  onCommand: (id: CommandId) => void;
  onOpenRecent: (entry: RecentEntry) => void;
};

export function useAppMenu(callbacks: AppMenuCallbacks, state: MenuState, recentFiles: RecentEntry[] | null) {
  const menuRef = useRef<AppMenu | null>(null);
  const [menuReady, setMenuReady] = useState(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!isDesktop) {
      return;
    }
    let cancelled = false;
    installAppMenu({
      onCommand: (id) => callbacksRef.current.onCommand(id),
      onOpenRecent: (entry) => callbacksRef.current.onOpenRecent(entry),
      onClearRecent: () => clearRecentFiles(),
    })
      .then((menu) => {
        if (!cancelled) {
          menuRef.current = menu;
          setMenuReady(true);
        }
        return onWindowFocused(() => menuRef.current?.activate());
      })
      .catch((error: unknown) => console.error("Could not build the app menu", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const { hasDocument, split, darkPages, invertImages } = state;

  useEffect(() => {
    menuRef.current?.setState({ hasDocument, split, darkPages, invertImages });
  }, [menuReady, hasDocument, split, darkPages, invertImages]);

  useEffect(() => {
    if (recentFiles) {
      menuRef.current?.setRecent(recentFiles);
    }
  }, [menuReady, recentFiles]);
}
