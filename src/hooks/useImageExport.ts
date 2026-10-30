import { useCallback, useRef, useState } from "react";
import type { CommandId } from "../lib/commands";
import { confirmReplace, downloadImage, existingFiles, offerToShowExport, pickFolder, pickImageSavePath, writeImage, writeImageInFolder } from "../lib/imageFiles";
import { defaultExportOptions, exportSummary, mimeTypeFor, normalizeExportOptions, pageImageNames, type ExportOptions } from "../lib/imageExport";
import { ExportCancelledError, renderPageImage } from "../lib/pageImages";
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

export type ExportProgress = { done: number; total: number };

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
  const existing = await existingFiles(folder, names);
  if (existing.length && !(await confirmReplace(existing, folder))) {
    return null;
  }
  return (name, bytes) => writeImageInFolder(folder, name, bytes, existing.length > 0);
}

export function useImageExport({ workspaceRef, handles }: WorkspaceApi, settled: (tabId: string) => Promise<void>) {
  const [stored, setStored] = usePersistentState<unknown>("clumsy.exportImages", defaultExportOptions);
  const [request, setRequest] = useState<ExportRequest | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const running = useRef<AbortController | null>(null);

  const runExportCommand = useCallback((id: CommandId) => {
    if (!exportCommands.has(id)) {
      return false;
    }
    const tab = ws.focusedTab(workspaceRef.current);
    const handle = handles.current.get(tab.id);
    const doc = handle?.viewer.pdfDocument;
    if (tab.kind === "document" && handle && doc && !running.current) {
      const currentPage = handle.viewer.pageNumber - 1;
      const selection = handle.explicitPages();
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
      const storage = doc.annotationStorage.print;
      for (const [index, page] of pages.entries()) {
        if (controller.signal.aborted || page >= doc.numPages) {
          break;
        }
        if (pages.length > 1) {
          setProgress({ done: index, total: pages.length });
        }
        const path = await write(names[index], await renderPageImage(doc, storage, page, options, controller.signal));
        written += 1;
        firstPath ??= path || null;
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
