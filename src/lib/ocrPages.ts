import { AnnotationMode, type PDFDocumentProxy, type PDFPageProxy, type PageViewport } from "pdfjs-dist";
import { exportPixelSize, renderScale } from "./imageExport";
import { coversPage, fillTransform, imageRects, pixelRects, recordImageCoordinates, recordedImages } from "./imageRegions";
import { OCR_DPI, PICTURE_SHARE, boxAround, hasText, textCorners, type Box } from "./ocr";

type TextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;

const stringsOf = (content: TextContent) => content.items.map((item) => ("str" in item ? item.str : ""));

export async function pageHasText(doc: PDFDocumentProxy, pageIndex: number) {
  const page = await doc.getPage(pageIndex + 1);
  return hasText(stringsOf(await page.getTextContent()));
}

function textBoxes(content: TextContent, viewport: PageViewport): Box[] {
  return content.items.flatMap((item) =>
    "str" in item && item.str.trim()
      ? [boxAround(textCorners(item.transform, item.width, item.height).map(([x, y]) => viewport.convertToViewportPoint(x, y) as [number, number]))]
      : [],
  );
}

function picturesOnly(canvas: HTMLCanvasElement, page: PDFPageProxy, rotation: number) {
  const images = recordedImages(page);
  const rects = images ? imageRects(images.coords, rotation - images.rotation).filter((rect) => coversPage(rect, PICTURE_SHARE)) : [];
  if (!rects.length) {
    return null;
  }
  const masked = document.createElement("canvas");
  masked.width = canvas.width;
  masked.height = canvas.height;
  const context = masked.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, masked.width, masked.height);
  for (const { x, y, width, height } of pixelRects(rects, canvas.width, canvas.height)) {
    context.drawImage(canvas, x, y, width, height, x, y, width, height);
  }
  const image = context.getImageData(0, 0, masked.width, masked.height);
  masked.width = 0;
  masked.height = 0;
  return image;
}

export type OcrInput = { image: ImageData; taken: Box[] };

export async function pageForOcr(doc: PDFDocumentProxy, pageIndex: number, keepText: boolean, signal: AbortSignal): Promise<OcrInput | null> {
  const page = await doc.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  const partial = keepText && hasText(stringsOf(content));
  const canvas = document.createElement("canvas");
  try {
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: renderScale(natural.width, natural.height, OCR_DPI) });
    const size = exportPixelSize(natural.width, natural.height, OCR_DPI);
    canvas.width = size.width;
    canvas.height = size.height;
    const task = page.render({ canvas, viewport, transform: fillTransform(canvas, viewport), annotationMode: AnnotationMode.DISABLE, recordImages: partial && !page.imageCoordinates });
    const cancel = () => task.cancel();
    signal.addEventListener("abort", cancel);
    try {
      await task.promise;
    } finally {
      signal.removeEventListener("abort", cancel);
    }
    if (!partial) {
      return { image: canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height), taken: [] };
    }
    recordImageCoordinates(page, page.imageCoordinates, viewport.rotation);
    const image = picturesOnly(canvas, page, viewport.rotation);
    return image && { image, taken: textBoxes(content, viewport) };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}
