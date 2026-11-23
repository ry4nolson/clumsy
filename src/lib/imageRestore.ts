import type { PageViewport, PDFPageProxy } from "pdfjs-dist";
import { coversPage, fillTransform, imageRects, looksLikePaper, pixelRects, recordImageCoordinates, recordedImages, type Rect } from "./imageRegions";

export type RenderedPageView = {
  id: number;
  div: HTMLDivElement;
  canvas: HTMLCanvasElement | null;
  pdfPage: object;
  imageCoordinates: ArrayLike<number> | null;
  viewport: { rotation: number };
};

export type ShownPreview = { page: object; canvas: HTMLCanvasElement; rotation: number };

const SAMPLE = 32;

function isScan(source: HTMLCanvasElement, { x, y, width, height }: Rect) {
  const sample = document.createElement("canvas");
  sample.width = SAMPLE;
  sample.height = SAMPLE;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context || !width || !height) {
    return false;
  }
  context.drawImage(source, x, y, width, height, 0, 0, SAMPLE, SAMPLE);
  return looksLikePaper(context.getImageData(0, 0, SAMPLE, SAMPLE).data);
}

function drawImages(source: HTMLCanvasElement, overlay: HTMLCanvasElement, rects: Rect[]) {
  overlay.width = source.width;
  overlay.height = source.height;
  const context = overlay.getContext("2d")!;
  const pixels = pixelRects(rects, source.width, source.height);
  for (const [index, { x, y, width, height }] of pixels.entries()) {
    if (coversPage(rects[index]) && isScan(source, pixels[index])) {
      continue;
    }
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

export function restoreRenderedImages(viewer: { pagesCount: number; getPageView(index: number): unknown }, enabled: boolean) {
  for (let index = 0; index < viewer.pagesCount; index += 1) {
    const view = viewer.getPageView(index) as RenderedPageView | undefined;
    if (view?.canvas) {
      restoreImages(view, enabled);
    }
  }
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

export type PreviewLayers = { hash: string; config: Promise<unknown> } | null;

export function previewRender(page: PDFPageProxy, canvas: HTMLCanvasElement, viewport: PageViewport, layers: PreviewLayers = null) {
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const recording = !page.imageCoordinates;
  const optionalContentConfigPromise = (layers?.config ?? undefined) as Parameters<PDFPageProxy["render"]>[0]["optionalContentConfigPromise"];
  const task = page.render({ canvas, viewport, transform: fillTransform(canvas, viewport), recordImages: recording, optionalContentConfigPromise });
  task.promise.then(
    () => recording && recordImageCoordinates(page, page.imageCoordinates, viewport.rotation),
    () => {},
  );
  return task;
}
