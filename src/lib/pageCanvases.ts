import type { PDFPageProxy } from "pdfjs-dist";

type Rendered = { canvas: HTMLCanvasElement; rotation: number; annotated: boolean };
type Registry = { canvases: Map<number, Rendered[]>; pending: Map<number, Promise<void>> };

const registries = new WeakMap<object, Registry>();

function registryFor(document: object) {
  let registry = registries.get(document);
  if (!registry) {
    registry = { canvases: new Map(), pending: new Map() };
    registries.set(document, registry);
  }
  return registry;
}

export function publishPageCanvas(document: object, index: number, canvas: HTMLCanvasElement, rotation: number, annotated = false) {
  const { canvases } = registryFor(document);
  for (const [page, rendered] of canvases) {
    const kept = rendered.filter((entry) => entry.canvas.width && entry.canvas !== canvas);
    if (kept.length) {
      canvases.set(page, kept);
    } else {
      canvases.delete(page);
    }
  }
  canvases.set(index, [...(canvases.get(index) ?? []), { canvas, rotation, annotated }]);
}

export function trackPageRender(document: object, index: number, render: Promise<unknown>) {
  const { pending } = registryFor(document);
  const settled: Promise<void> = render
    .then(() => {})
    .catch(() => {})
    .finally(() => {
      if (pending.get(index) === settled) {
        pending.delete(index);
      }
    });
  pending.set(index, settled);
}

export async function copyRenderedPage(document: object, page: PDFPageProxy, rotation: number, target: HTMLCanvasElement, width: number, cancelled: () => boolean) {
  const index = page.pageNumber - 1;
  await registries.get(document)?.pending.get(index);
  if (cancelled() || !renderedCanvas(document, index, rotation, width, false)) {
    return false;
  }
  const annotatedOnly = !renderedCanvas(document, index, rotation, width, true) && (await page.getAnnotations()).length > 0;
  const source = !cancelled() && renderedCanvas(document, index, rotation, width, annotatedOnly);
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

function renderedCanvas(document: object, index: number, rotation: number, width: number, annotatedOnly: boolean) {
  let best: HTMLCanvasElement | null = null;
  for (const { canvas, rotation: shown, annotated } of registries.get(document)?.canvases.get(index) ?? []) {
    if (shown === rotation && canvas.width >= width && canvas.height > 0 && (annotated || !annotatedOnly) && (!best || canvas.width < best.width)) {
      best = canvas;
    }
  }
  return best;
}
