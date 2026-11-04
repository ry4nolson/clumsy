import type { PDFPageProxy } from "pdfjs-dist";

type Rendered = { canvas: HTMLCanvasElement; rotation: number };
type Registry = Map<number, Rendered>;

const registries = new WeakMap<object, Registry>();

export function publishPageCanvas(document: object, index: number, canvas: HTMLCanvasElement, rotation: number) {
  let registry = registries.get(document);
  if (!registry) {
    registry = new Map();
    registries.set(document, registry);
  }
  for (const [page, rendered] of registry) {
    if (!rendered.canvas.width) {
      registry.delete(page);
    }
  }
  registry.set(index, { canvas, rotation });
}

export async function copyRenderedPage(document: object, page: PDFPageProxy, rotation: number, target: HTMLCanvasElement, width: number, cancelled: () => boolean) {
  const index = page.pageNumber - 1;
  if (!renderedCanvas(document, index, rotation, width) || (await page.getAnnotations()).length > 0 || cancelled()) {
    return false;
  }
  const source = renderedCanvas(document, index, rotation, width);
  const context = source && target.getContext("2d");
  if (!source || !context) {
    return false;
  }
  target.width = Math.max(1, Math.floor(width));
  target.height = Math.max(1, Math.floor((width * source.height) / source.width));
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, target.width, target.height);
  return true;
}

function renderedCanvas(document: object, index: number, rotation: number, width: number) {
  const rendered = registries.get(document)?.get(index);
  return rendered && rendered.rotation === rotation && rendered.canvas.width >= width && rendered.canvas.height > 0 ? rendered.canvas : null;
}
