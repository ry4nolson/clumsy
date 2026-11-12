import type { PDFDocumentProxy } from "pdfjs-dist";
import { normalizedBox, type Rect } from "./signingTarget";

export type PlacedBox = { page: number; rect: Rect };

type Drag = { div: HTMLElement; page: number; x: number; y: number; box: HTMLElement; pointerId: number };

const pointIn = (div: HTMLElement, event: PointerEvent): [number, number] => {
  const bounds = div.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - bounds.left - div.clientLeft, 0), div.clientWidth);
  const y = Math.min(Math.max(event.clientY - bounds.top - div.clientTop, 0), div.clientHeight);
  return [x, y];
};

async function toPdfRect(doc: PDFDocumentProxy, page: number, div: HTMLElement, viewRotation: number, corners: Rect) {
  const pdfPage = await doc.getPage(page);
  const rotation = (viewRotation + pdfPage.rotate) % 360;
  const base = pdfPage.getViewport({ scale: 1, rotation });
  const viewport = pdfPage.getViewport({ scale: div.clientWidth / base.width, rotation });
  const [ax, ay] = viewport.convertToPdfPoint(corners[0], corners[1]);
  const [bx, by] = viewport.convertToPdfPoint(corners[2], corners[3]);
  return normalizedBox([ax, ay, bx, by]);
}

export function placeSignatureBox(container: HTMLElement, doc: PDFDocumentProxy, viewRotation: number): Promise<PlacedBox | null> {
  const area = container.parentElement ?? container;
  const hint = document.createElement("div");
  hint.className = "signature-placement-hint";
  hint.textContent = "Drag a box where the signature goes. Press Esc to cancel.";
  area.append(hint);
  area.classList.add("signature-placing");
  let drag: Drag | null = null;

  return new Promise((resolve) => {
    const finish = (result: PlacedBox | null) => {
      container.removeEventListener("pointerdown", onDown, true);
      container.removeEventListener("pointermove", onMove, true);
      container.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
      drag?.box.remove();
      hint.remove();
      area.classList.remove("signature-placing");
      resolve(result);
    };

    const onDown = (event: PointerEvent) => {
      const div = (event.target as HTMLElement).closest<HTMLElement>(".page[data-page-number]");
      if (event.button !== 0 || !div || drag) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      container.setPointerCapture(event.pointerId);
      const [x, y] = pointIn(div, event);
      const box = document.createElement("div");
      box.className = "signature-placement";
      div.append(box);
      drag = { div, page: Number(div.dataset.pageNumber), x, y, box, pointerId: event.pointerId };
      onMove(event);
    };

    const onMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const [x, y] = pointIn(drag.div, event);
      Object.assign(drag.box.style, {
        left: `${Math.min(x, drag.x) + drag.div.clientLeft}px`,
        top: `${Math.min(y, drag.y) + drag.div.clientTop}px`,
        width: `${Math.abs(x - drag.x)}px`,
        height: `${Math.abs(y - drag.y)}px`,
      });
    };

    const onUp = async (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const current = drag;
      const [x, y] = pointIn(current.div, event);
      drag = null;
      current.box.remove();
      const rect = await toPdfRect(doc, current.page, current.div, viewRotation, [current.x, current.y, x, y]).catch(() => null);
      if (rect) {
        finish({ page: current.page, rect });
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    };

    container.addEventListener("pointerdown", onDown, true);
    container.addEventListener("pointermove", onMove, true);
    container.addEventListener("pointerup", onUp, true);
    window.addEventListener("keydown", onKey, true);
  });
}
