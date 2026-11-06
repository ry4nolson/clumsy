import { useCallback, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CommandId } from "../lib/commands";
import { decryptPdfOffThread, extractPagesOffThread } from "../lib/pageEditWorker";
import { passwordOf } from "../lib/pdfjs";
import { canPrint, printPdf, showError } from "../lib/platform";
import { pagesToPrint, printableBytes, printCommands } from "../lib/print";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

const printOps = { extract: extractPagesOffThread, decrypt: decryptPdfOffThread };

async function decryptionPassword(doc: PDFDocumentProxy) {
  const { info } = await doc.getMetadata();
  return (info as { EncryptFilterName?: string | null }).EncryptFilterName ? (passwordOf(doc) ?? "") : null;
}

export function usePrint({ workspaceRef, handles }: WorkspaceApi, settled: (tabId: string) => Promise<void>) {
  const running = useRef(false);

  const print = async (tabId: string, name: string, pages: number[] | null) => {
    running.current = true;
    try {
      await settled(tabId);
      const viewer = handles.current.get(tabId)?.viewer;
      const doc = viewer?.pdfDocument;
      if (!viewer || !doc) {
        return;
      }
      const saved = await viewer.save(true);
      if (!saved) {
        return;
      }
      const bytes = await printableBytes(saved, pages, await decryptionPassword(doc), printOps);
      if ((await printPdf(name, bytes)) === "unreadable") {
        await showError(`Couldn't print “${name}”. The file couldn't be read for printing.`);
      }
    } catch (error) {
      if (handles.current.has(tabId)) {
        await showError(`Couldn't print “${name}”.\n\n${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      running.current = false;
    }
  };

  const runPrintCommand = useCallback((id: CommandId) => {
    if (!printCommands.has(id)) {
      return false;
    }
    const tab = ws.focusedTab(workspaceRef.current);
    const handle = handles.current.get(tab.id);
    const doc = handle?.viewer.pdfDocument;
    if (canPrint && tab.kind === "document" && handle && doc && !running.current) {
      print(tab.id, tab.name, pagesToPrint(id, handle.selectedPages(), doc.numPages));
    }
    return true;
  }, []);

  return { runPrintCommand };
}
