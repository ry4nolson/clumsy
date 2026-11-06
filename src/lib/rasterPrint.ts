import { PDFDocument } from "@cantoo/pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ExportCancelledError, renderPageImage, type PrintStorage } from "./pageImages";
import { RASTER_QUALITY, rasterDpi } from "./print";

export async function pdfFromRenderedPages(doc: PDFDocumentProxy, storage: PrintStorage, pages: number[], signal: AbortSignal, onPage: (done: number) => void) {
  const options = { format: "jpeg" as const, dpi: rasterDpi(pages.length), quality: RASTER_QUALITY };
  const output = await PDFDocument.create();
  for (const [index, pageIndex] of pages.entries()) {
    if (signal.aborted) {
      throw new ExportCancelledError();
    }
    onPage(index);
    const { width, height } = (await doc.getPage(pageIndex + 1)).getViewport({ scale: 1 });
    const image = await output.embedJpg(await renderPageImage(doc, storage, pageIndex, options, signal));
    output.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  }
  return output.save({ addDefaultPage: false });
}
