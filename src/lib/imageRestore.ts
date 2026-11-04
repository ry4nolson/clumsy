import type { PageViewport, PDFPageProxy } from "pdfjs-dist";
import { fillTransform, imageRects, pixelRects, recordImageCoordinates, recordedImages, type Rect } from "./imageRegions";

export type RenderedPageView = {
  id: number;
  div: HTMLDivElement;
  canvas: HTMLCanvasElement | null;
  pdfPage: object;
  imageCoordinates: ArrayLike<number> | null;
  viewport: { rotation: number };
};

export type ShownPreview = { page: object; canvas: HTMLCanvasElement; rotation: number };

function drawImages(source: HTMLCanvasElement, overlay: HTMLCanvasElement, rects: Rect[]) {
  overlay.width = source.width;
  overlay.height = source.height;
  const context = overlay.getContext("2d")!;
  for (const { x, y, width, height } of pixelRects(rects, source.width, source.height)) {
    context.drawImage(source, x, y, width, height, x, y, width, height);
  }
}

export function restoreImages(pageView: RenderedPageView, enabled: boolean) {
  const { canvas, div, pdfPage, viewport } = pageView;
  recordImageCoordinates(pdfPage, pageView.imageCoordinates, viewport.rotation);
  const images = recordedImages(pdfPage);
  let overlay = div.querySelector<HTMLCanvasElement>("canvas.image-restore");
  if (!enabled || !canvas || !images?.coords.length) {
    if (overlay) {
      overlay.width = 0;
      overlay.height = 0;
      overlay.remove();
    }
    return;
  }
  if (!overlay) {
    overlay = document.createElement("canvas");
    overlay.className = "image-restore";
    overlay.setAttribute("aria-hidden", "true");
  }
  if (!overlay.isConnected) {
    div.querySelector(".canvasWrapper")?.after(overlay);
  }
  drawImages(canvas, overlay, imageRects(images.coords, viewport.rotation - images.rotation));
}

export function restorePreviewImages(overlay: HTMLCanvasElement, shown: ShownPreview | null, enabled: boolean) {
  const images = shown && enabled && shown.canvas.width ? recordedImages(shown.page) : null;
  if (!shown || !images?.coords.length) {
    overlay.width = 0;
    overlay.height = 0;
    return;
  }
  drawImages(shown.canvas, overlay, imageRects(images.coords, shown.rotation - images.rotation));
}

export function previewRender(page: PDFPageProxy, canvas: HTMLCanvasElement, viewport: PageViewport) {
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const recording = !page.imageCoordinates;
  const task = page.render({ canvas, viewport, transform: fillTransform(canvas, viewport), recordImages: recording });
  task.promise.then(
    () => recording && recordImageCoordinates(page, page.imageCoordinates, viewport.rotation),
    () => {},
  );
  return task;
}
