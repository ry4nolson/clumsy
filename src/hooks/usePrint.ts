import { useCallback, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Progress } from "../components/ProgressView";
import type { MarkdownHandle } from "../components/MarkdownTab";
import type { CommandId } from "../lib/commands";
import { printArticle } from "../lib/markdownPrint";
import { ExportCancelledError } from "../lib/pageImages";
import { decryptPdfOffThread, extractPagesOffThread } from "../lib/pageEditWorker";
import { passwordOf } from "../lib/pdfjs";
import { canPrint, printPdf, printWebview, showError } from "../lib/platform";
import { pagesToPrint, printCommands, printJobName, printWithFallback } from "../lib/print";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

const printOps = { extract: extractPagesOffThread, decrypt: decryptPdfOffThread };

const unreadable = (name: string) => `Couldn't print “${name}”. The file couldn't be read for printing.`;

async function decryptionPassword(doc: PDFDocumentProxy) {
  const { info } = await doc.getMetadata();
  return (info as { EncryptFilterName?: string | null }).EncryptFilterName ? (passwordOf(doc) ?? "") : null;
}

const allPages = (count: number) => Array.from({ length: count }, (_, index) => index);

export function usePrint({ workspaceRef, handles, markdownHandles }: WorkspaceApi, settled: (tabId: string) => Promise<void>) {
  const running = useRef(false);
  const rendering = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  const report = async (tabId: string, name: string, error: unknown) => {
    if (handles.current.has(tabId) || markdownHandles.current.has(tabId)) {
      await showError(`Couldn't print “${name}”.\n\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const asImages = async (tabId: string, doc: PDFDocumentProxy, pages: number[]) => {
    const controller = new AbortController();
    rendering.current = controller;
    setProgress({ done: 0, total: pages.length });
    const stillCurrent = () => {
      if (handles.current.get(tabId)?.viewer.pdfDocument !== doc) {
        throw new Error("The document changed while it was being prepared for printing.");
      }
    };
    try {
      const { pdfFromRenderedPages } = await import("../lib/rasterPrint");
      const bytes = await pdfFromRenderedPages(doc, doc.annotationStorage.print, pages, controller.signal, (done) => {
        stillCurrent();
        setProgress({ done, total: pages.length });
      });
      stillCurrent();
      return bytes;
    } catch (error) {
      if (error instanceof ExportCancelledError) {
        return null;
      }
      throw error;
    } finally {
      rendering.current = null;
      setProgress(null);
    }
  };

  const printDocument = async (id: CommandId, tabId: string, name: string) => {
    await settled(tabId);
    const handle = handles.current.get(tabId);
    const viewer = handle?.viewer;
    const doc = viewer?.pdfDocument;
    if (!handle || !viewer || !doc) {
      return;
    }
    const pages = pagesToPrint(id, handle.selectedPages(), doc.numPages);
    const saved = await viewer.save(true).catch((error) => {
      if (viewer.pdfDocument === doc) {
        throw error;
      }
      return null;
    });
    if (!saved || viewer.pdfDocument !== doc) {
      return;
    }
    const outcome = await printWithFallback(saved, pages, await decryptionPassword(doc), {
      ...printOps,
      send: (bytes) => printPdf(name, bytes),
      asImages: () => asImages(tabId, doc, pages ?? allPages(doc.numPages)),
    });
    if (outcome === "unreadable") {
      await showError(unreadable(name));
    }
  };

  const printMarkdown = async (handle: MarkdownHandle, name: string) => {
    const outcome = await printArticle(await handle.printable(), () => printWebview(printJobName(name)));
    if (outcome === "unreadable") {
      await showError(unreadable(name));
    }
  };

  const run = async (task: () => Promise<void>, tabId: string, name: string) => {
    running.current = true;
    try {
      await task();
    } catch (error) {
      await report(tabId, name, error);
    } finally {
      running.current = false;
    }
  };

  const runPrintCommand = useCallback((id: CommandId) => {
    if (!printCommands.has(id)) {
      return false;
    }
    const tab = ws.focusedTab(workspaceRef.current);
    if (!canPrint || running.current) {
      return true;
    }
    const markdown = tab.kind === "markdown" ? markdownHandles.current.get(tab.id) : undefined;
    if (tab.kind === "markdown" && markdown && id === "print") {
      run(() => printMarkdown(markdown, tab.name), tab.id, tab.name);
    } else if (tab.kind === "document" && handles.current.get(tab.id)?.viewer.pdfDocument) {
      run(() => printDocument(id, tab.id, tab.name), tab.id, tab.name);
    }
    return true;
  }, []);

  return {
    runPrintCommand,
    progressDialog: { progress, onStop: () => rendering.current?.abort() },
  };
}
