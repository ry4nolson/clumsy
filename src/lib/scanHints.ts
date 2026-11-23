import type { PDFDocumentProxy } from "pdfjs-dist";
import { coversPage, imageRects, recordedImages } from "./imageRegions";
import { pageHasText } from "./ocrPages";

export const PAGE_RENDERED = "clumsy-page-rendered";

const HINT = "scan-hint";
const IMAGE_SHARE = 0.5;
const LABEL = "Recognize Text (OCR)…";

type Actions = { onRecognize: (pageIndex: number) => void; onDismiss: () => void };

function hintElement(pageIndex: number, { onRecognize, onDismiss }: Actions) {
  const hint = document.createElement("div");
  hint.className = HINT;
  const recognize = document.createElement("button");
  recognize.type = "button";
  recognize.className = "scan-hint-action";
  recognize.textContent = LABEL;
  recognize.title = "This page has no text to search or select";
  recognize.addEventListener("click", () => onRecognize(pageIndex));
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "scan-hint-dismiss";
  dismiss.textContent = "×";
  dismiss.title = "Dismiss";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.addEventListener("click", onDismiss);
  hint.append(recognize, dismiss);
  return hint;
}

export function attachScanHints(container: HTMLElement, doc: PDFDocumentProxy, actions: Actions) {
  const scans = new Map<number, Promise<boolean>>();
  let detached = false;

  const isScan = async (pageIndex: number) => {
    const images = recordedImages(await doc.getPage(pageIndex + 1));
    if (!images) {
      return false;
    }
    const known = scans.get(pageIndex);
    if (known) {
      return known;
    }
    const pictured = imageRects(images.coords, 0).some((rect) => coversPage(rect, IMAGE_SHARE));
    const answer = pictured ? pageHasText(doc, pageIndex).then((has) => !has) : Promise.resolve(false);
    scans.set(pageIndex, answer);
    return answer;
  };

  const sync = async (page: HTMLElement) => {
    const pageIndex = Number(page.dataset.pageNumber) - 1;
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= doc.numPages) {
      return;
    }
    const scan = await isScan(pageIndex).catch(() => false);
    if (!detached && scan && page.isConnected && !page.querySelector(`:scope > .${HINT}`)) {
      page.append(hintElement(pageIndex, actions));
    }
  };

  const onRendered = (event: Event) => {
    if (event.target instanceof HTMLElement) {
      void sync(event.target);
    }
  };
  container.addEventListener(PAGE_RENDERED, onRendered);
  container.querySelectorAll<HTMLElement>('.page[data-loaded="true"]').forEach((page) => void sync(page));

  return () => {
    detached = true;
    container.removeEventListener(PAGE_RENDERED, onRendered);
    container.querySelectorAll(`.${HINT}`).forEach((hint) => hint.remove());
  };
}
