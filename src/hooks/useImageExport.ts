import { useCallback, useRef, useState } from "react";
import type { Progress } from "../components/ProgressView";
import type { CommandId } from "../lib/commands";
import { confirmReplace, downloadImage, offerToShowExport, pickFolder, pickImageSavePath, writeImage, writeImageInFolder } from "../lib/imageFiles";
import { defaultExportOptions, exportSummary, mimeTypeFor, normalizeExportOptions, pageImageNames, type ExportOptions } from "../lib/imageExport";
import { hasOwnedChanges } from "../lib/markup";
import { NOTE_KEY_PREFIX } from "../lib/notes";
import { ExportCancelledError, renderPageImage } from "../lib/pageImages";
import { loadPdf, passwordOf } from "../lib/pdfjs";
import { isDesktop, showError } from "../lib/platform";
import { usePersistentState } from "../lib/preferences";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

export type ExportRequest = {
  tabId: string;
  name: string;
  selection: number[];
  pageCount: number;
  currentPage: number;
  pageSize: { width: number; height: number };
};

export type ExportProgress = Progress;

type Write = (name: string, bytes: Uint8Array) => Promise<string | void>;

const exportCommands = new Set<CommandId>(["exportPagesAsImages", "exportSelectedPagesAsImages"]);

async function chooseDestination(names: string[], options: ExportOptions): Promise<Write | null> {
  if (!isDesktop) {
    return async (name, bytes) => downloadImage(name, bytes, mimeTypeFor(options.format));
  }
  if (names.length === 1) {
    const path = await pickImageSavePath(names[0], options.format);
    return path ? (_, bytes) => writeImage(path, bytes) : null;
  }
  const folder = await pickFolder();
  if (!folder) {
    return null;
  }
  if (!(await confirmReplace(folder, names))) {
    return null;
  }
  return (name, bytes) => writeImageInFolder(folder, name, bytes);
}

export function useImageExport({ workspaceRef, handles }: WorkspaceApi, settled: (tabId: string) => Promise<void>) {
  const [stored, setStored] = usePersistentState<unknown>("clumsy.exportImages", defaultExportOptions);
  const [request, setRequest] = useState<ExportRequest | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const running = useRef<AbortController | null>(null);

  const runExportCommand = useCallback((id: CommandId, explicit?: number[]) => {
    if (!exportCommands.has(id)) {
      return false;
    }
    const tab = ws.focusedTab(workspaceRef.current);
    const handle = handles.current.get(tab.id);
    const doc = handle?.viewer.pdfDocument;
    if (tab.kind === "document" && handle && doc && !running.current) {
      const currentPage = handle.viewer.pageNumber - 1;
      const selection = explicit?.length ? explicit : handle.explicitPages();
      doc.getPage(currentPage + 1).then((page) => {
        const { width, height } = page.getViewport({ scale: 1 });
        setRequest({ tabId: tab.id, name: tab.name, selection, pageCount: doc.numPages, currentPage, pageSize: { width, height } });
      });
    }
    return true;
  }, []);

  const exportPages = async (target: ExportRequest, options: ExportOptions, pages: number[]) => {
    const names = pageImageNames(target.name, pages, target.pageCount, options.format);
    const write = await chooseDestination(names, options);
    if (!write) {
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    let written = 0;
    let firstPath: string | null = null;
    let failed = false;
    try {
      await settled(target.tabId);
      const viewer = handles.current.get(target.tabId)?.viewer;
      const doc = viewer?.pdfDocument;
      if (!viewer || !doc) {
        return;
      }
      viewer.commitEdits();
      const saved = hasOwnedChanges(doc.annotationStorage, NOTE_KEY_PREFIX) ? await viewer.save(true) : null;
      const source = saved ? await loadPdf(saved, async () => passwordOf(doc) ?? null) : doc;
      try {
        const storage = source.annotationStorage.print;
        for (const [index, page] of pages.entries()) {
          if (controller.signal.aborted || page >= source.numPages) {
            break;
          }
          if (pages.length > 1) {
            setProgress({ done: index, total: pages.length });
          }
          const path = await write(names[index], await renderPageImage(source, storage, page, options, controller.signal));
          written += 1;
          firstPath ??= path || null;
        }
      } finally {
        if (source !== doc) {
          source.loadingTask.destroy();
        }
      }
    } catch (error) {
      if (!(error instanceof ExportCancelledError)) {
        failed = true;
        if (handles.current.has(target.tabId)) {
          await showError(`Couldn't export the pages.\n\n${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } finally {
      running.current = null;
      setProgress(null);
    }
    if (!failed && firstPath) {
      await offerToShowExport(exportSummary(written, pages.length), firstPath);
    }
  };

  const start = (options: ExportOptions, pages: number[]) => {
    const target = request;
    setStored(options);
    setRequest(null);
    if (target) {
      exportPages(target, options, pages);
    }
  };

  return {
    runExportCommand,
    dialog: {
      request,
      progress,
      options: normalizeExportOptions(stored),
      onExport: start,
      onClose: () => setRequest(null),
      onStop: () => running.current?.abort(),
    },
  };
}
