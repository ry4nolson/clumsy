import { useCallback, useEffect, useState } from "react";
import { fileNameFromPath, getRecentFiles, onRecentFilesChanged, readDocumentFromPath, removeRecentFile, showError, type DocumentSource } from "../lib/platform";
import type { RecentEntry } from "../lib/recent";

export function useRecentFiles(openSource: (source: Promise<DocumentSource | null>) => unknown) {
  const [recentFiles, setRecentFiles] = useState<RecentEntry[] | null>(null);

  useEffect(() => {
    const refresh = () => {
      getRecentFiles().then(setRecentFiles);
    };
    refresh();
    const cleanup = onRecentFilesChanged(refresh);
    return () => {
      cleanup.then((dispose) => dispose());
    };
  }, []);

  const openRecent = useCallback(
    async (entry: RecentEntry) => {
      if (!entry.exists) {
        await removeRecentFile(entry.path);
        await showError(`“${fileNameFromPath(entry.path)}” couldn’t be found. It may have been moved or deleted, so it was removed from recent files.`);
        return;
      }
      openSource(readDocumentFromPath(entry.path));
    },
    [openSource],
  );

  return { recentFiles, openRecent };
}
