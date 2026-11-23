import { useCallback, useRef, useState } from "react";
import type { Progress } from "../components/ProgressView";
import type { CommandId } from "../lib/commands";
import { confidentWords, coveredByText, ocrLanguage, ocrSummary, type OcrTally } from "../lib/ocr";
import { OcrStoppedError, createOcrClient } from "../lib/ocrClient";
import { hasModel, loadModel } from "../lib/ocrModels";
import { pageForOcr } from "../lib/ocrPages";
import type { OcrPage } from "../lib/ocrPdf";
import { textLayerPdfOffThread } from "../lib/pageEditWorker";
import { usePersistentState } from "../lib/preferences";
import * as ws from "../lib/workspace";
import type { PageEditsApi } from "./usePageEdits";
import type { WorkspaceApi } from "./useWorkspace";

export type OcrRequest = { tabId: string; name: string; selection: number[]; pageCount: number; currentPage: number };

export type OcrOptions = { language: string; skipText: boolean };

export type OcrStatus =
  | { kind: "choosing" }
  | { kind: "downloading"; language: string }
  | { kind: "working"; progress: Progress }
  | { kind: "finishing" }
  | { kind: "done"; summary: string }
  | { kind: "failed"; message: string };

const SIGNATURE_ACTION = "Adding searchable text to this PDF";
const CHANGED = "The document changed while its text was being recognized. Try again.";
const OFFLINE = "language data couldn't be downloaded. Check your internet connection and try again.";

const optionsFrom = (stored: unknown): OcrOptions => {
  const value = (stored ?? {}) as Partial<OcrOptions>;
  return { language: ocrLanguage(value.language).code, skipText: value.skipText !== false };
};

export function useOcr({ workspaceRef, handles }: WorkspaceApi, { capture, replaceCaptured }: Pick<PageEditsApi, "capture" | "replaceCaptured">) {
  const [stored, setStored] = usePersistentState<unknown>("clumsy.ocr", null);
  const [request, setRequest] = useState<OcrRequest | null>(null);
  const [status, setStatus] = useState<OcrStatus>({ kind: "choosing" });
  const [needsDownload, setNeedsDownload] = useState(false);
  const running = useRef<AbortController | null>(null);
  const options = optionsFrom(stored);

  const checkDownload = (language: string) => void hasModel(language).then((has) => setNeedsDownload(!has));

  const runOcrCommand = useCallback((id: CommandId, explicit?: number[]) => {
    if (id !== "recognizeText") {
      return false;
    }
    const tab = ws.focusedTab(workspaceRef.current);
    const handle = handles.current.get(tab.id);
    const doc = handle?.viewer.pdfDocument;
    if (tab.kind === "document" && handle && doc && !running.current) {
      setStatus({ kind: "choosing" });
      checkDownload(optionsFrom(stored).language);
      setRequest({ tabId: tab.id, name: tab.name, selection: explicit?.length ? explicit : handle.explicitPages(), pageCount: doc.numPages, currentPage: handle.viewer.pageNumber - 1 });
    }
    return true;
  }, [stored]);

  const recognize = async (tabId: string, { language, skipText }: OcrOptions, pages: number[], signal: AbortSignal) => {
    const { label } = ocrLanguage(language);
    const model = await loadModel(language, signal, () => setStatus({ kind: "downloading", language: label })).catch((error) => {
      throw signal.aborted ? new OcrStoppedError() : new Error(`The ${label} ${OFFLINE}${error instanceof Error && error.message ? ` (${error.message})` : ""}`);
    });
    const captured = await capture(tabId);
    const doc = handles.current.get(tabId)?.viewer.pdfDocument;
    if (!captured || !doc) {
      throw new Error("This PDF isn't ready yet. Try again in a moment.");
    }
    const client = createOcrClient(model, signal);
    const found: OcrPage[] = [];
    const tally: OcrTally = { recognized: 0, skipped: 0, empty: 0 };
    try {
      for (const [index, pageIndex] of pages.entries()) {
        if (signal.aborted) {
          throw new OcrStoppedError();
        }
        setStatus({ kind: "working", progress: { done: index, total: pages.length } });
        if (handles.current.get(tabId)?.viewer.pdfDocument !== doc) {
          throw new Error(CHANGED);
        }
        const input = await pageForOcr(doc, pageIndex, skipText, signal);
        if (!input) {
          tally.skipped += 1;
          continue;
        }
        const { width, height } = input.image;
        const partial = input.taken.length > 0;
        const words = confidentWords(await client.recognize(input.image)).filter((word) => !coveredByText(word, input.taken));
        if (!words.length && partial) {
          tally.skipped += 1;
          continue;
        }
        if (words.length) {
          found.push({ pageIndex, width, height, words });
          tally.recognized += 1;
        } else {
          tally.empty += 1;
        }
      }
    } finally {
      client.close();
    }
    if (found.length) {
      setStatus({ kind: "finishing" });
      const bytes = await textLayerPdfOffThread(captured.version.bytes.slice(), found, captured.version.protection?.password);
      if (signal.aborted) {
        throw new OcrStoppedError();
      }
      if (handles.current.get(tabId)?.viewer.pdfDocument !== doc) {
        throw new Error(CHANGED);
      }
      if (!(await replaceCaptured(tabId, captured, bytes, SIGNATURE_ACTION))) {
        return null;
      }
    }
    return ocrSummary(tally);
  };

  const start = async (chosen: OcrOptions, pages: number[]) => {
    const target = request;
    if (!target || running.current) {
      return;
    }
    setStored(chosen);
    const controller = new AbortController();
    running.current = controller;
    try {
      const summary = await recognize(target.tabId, chosen, pages, controller.signal);
      if (summary) {
        setStatus({ kind: "done", summary });
      } else {
        setRequest(null);
      }
    } catch (error) {
      if (error instanceof OcrStoppedError || controller.signal.aborted) {
        setRequest(null);
      } else {
        setStatus({ kind: "failed", message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      running.current = null;
    }
  };

  const close = () => {
    running.current?.abort();
    setRequest(null);
  };

  return {
    runOcrCommand,
    dialog: { request, status, options, needsDownload, onLanguage: checkDownload, onStart: start, onClose: close },
  };
}
