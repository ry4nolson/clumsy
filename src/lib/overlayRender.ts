import { AnnotationMode, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import { centered } from "./alignment";
import { multiply, type Matrix } from "./contentPlacements";
import { changeBoxes, changeScale, inkMask } from "./overlayChanges";
import type { ChangeBox } from "./overlayPlan";

async function rendered(page: PDFPageProxy, scale: number) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  await page.render({ canvas, viewport, intent: "print", annotationMode: AnnotationMode.ENABLE }).promise;
  return canvas;
}

const release = (canvas: HTMLCanvasElement) => {
  canvas.width = 0;
  canvas.height = 0;
};

export async function sheetChanges(previous: PDFDocumentProxy, previousPage: number, current: PDFDocumentProxy, currentPage: number, alignment: Matrix | null): Promise<ChangeBox[]> {
  const [before, after] = [await previous.getPage(previousPage + 1), await current.getPage(currentPage + 1)];
  const fromSize = before.getViewport({ scale: 1 });
  const ontoSize = after.getViewport({ scale: 1 });
  const scale = changeScale(ontoSize.width, ontoSize.height);
  const afterCanvas = await rendered(after, scale);
  const fromScale = Math.min(scale, changeScale(fromSize.width, fromSize.height));
  const beforeCanvas = await rendered(before, fromScale);
  const placed = document.createElement("canvas");
  try {
    const { width, height } = afterCanvas;
    placed.width = width;
    placed.height = height;
    const context = placed.getContext("2d", { willReadFrequently: true });
    const afterContext = afterCanvas.getContext("2d", { willReadFrequently: true });
    if (!context || !afterContext) {
      return [];
    }
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    const toView: Matrix = [1 / fromScale, 0, 0, -1 / fromScale, 0, fromSize.height];
    const toCanvas: Matrix = [scale, 0, 0, -scale, 0, ontoSize.height * scale];
    context.setTransform(...multiply(multiply(toView, alignment ?? centered(fromSize, ontoSize)), toCanvas));
    context.drawImage(beforeCanvas, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    const boxes = changeBoxes(inkMask(context.getImageData(0, 0, width, height).data, width, height), inkMask(afterContext.getImageData(0, 0, width, height).data, width, height));
    return boxes.map((box) => ({ left: box.left / scale, right: box.right / scale, top: ontoSize.height - box.top / scale, bottom: ontoSize.height - box.bottom / scale }));
  } finally {
    [afterCanvas, beforeCanvas, placed].forEach(release);
    before.cleanup();
    after.cleanup();
  }
}
