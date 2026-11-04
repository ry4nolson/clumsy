import { imageRects, recordImageCoordinates, recordedImages } from "./imageRegions";

export type RenderedPageView = {
  id: number;
  div: HTMLDivElement;
  canvas: HTMLCanvasElement | null;
  pdfPage: object;
  imageCoordinates: ArrayLike<number> | null;
  viewport: { rotation: number };
};

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
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  const context = overlay.getContext("2d")!;
  for (const rect of imageRects(images.coords, viewport.rotation - images.rotation)) {
    const x = Math.floor(rect.x * canvas.width);
    const y = Math.floor(rect.y * canvas.height);
    const width = Math.ceil(rect.width * canvas.width);
    const height = Math.ceil(rect.height * canvas.height);
    context.drawImage(canvas, x, y, width, height, x, y, width, height);
  }
}
