import { AnnotationMode, type PDFDocumentProxy } from "pdfjs-dist";
import { exportPixelSize, mimeTypeFor, renderScale, type ExportOptions } from "./imageExport";

export class ExportCancelledError extends Error {}

type PrintStorage = PDFDocumentProxy["annotationStorage"]["print"];

function canvasBytes(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Uint8Array>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject) : reject(new Error("The page couldn't be encoded."))),
      type,
      quality,
    ),
  );
}

export async function renderPageImage(doc: PDFDocumentProxy, storage: PrintStorage, pageIndex: number, options: ExportOptions, signal: AbortSignal) {
  const page = await doc.getPage(pageIndex + 1);
  const canvas = document.createElement("canvas");
  try {
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: renderScale(natural.width, natural.height, options.dpi) });
    const size = exportPixelSize(natural.width, natural.height, options.dpi);
    canvas.width = size.width;
    canvas.height = size.height;
    const task = page.render({ canvas, viewport, intent: "print", annotationMode: AnnotationMode.ENABLE_STORAGE, printAnnotationStorage: storage });
    const cancel = () => task.cancel();
    signal.addEventListener("abort", cancel);
    try {
      await task.promise;
    } catch (error) {
      throw signal.aborted ? new ExportCancelledError() : error;
    } finally {
      signal.removeEventListener("abort", cancel);
    }
    return await canvasBytes(canvas, mimeTypeFor(options.format), options.quality);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}
