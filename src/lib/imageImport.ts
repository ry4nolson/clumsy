import { hasTransparency, reencodeFormat } from "./imageFormats";
import { groupRuns, imagesPdfName, pdfFromImages, type DecodedImage, type ImageFile } from "./imagePdf";
import { combinePdfs } from "./pageEdits";
import type { OpenedFile } from "./imageFiles";
import type { PdfSource } from "./platform";

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image couldn't be encoded."))), type, quality),
  );
}

export async function decodeImage(file: ImageFile): Promise<DecodedImage> {
  const url = URL.createObjectURL(new Blob([file.data as BlobPart]));
  const canvas = document.createElement("canvas");
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const format = reencodeFormat(hasTransparency(context.getImageData(0, 0, canvas.width, canvas.height).data));
    const blob = await canvasBlob(canvas, `image/${format}`, 0.92);
    return { format, data: new Uint8Array(await blob.arrayBuffer()) };
  } catch {
    throw new Error(`“${file.name}” couldn't be read as an image.`);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    URL.revokeObjectURL(url);
  }
}

export async function imagesToSource(images: Array<Promise<ImageFile>>): Promise<PdfSource> {
  const files = await Promise.all(images);
  return { name: imagesPdfName(files.map((file) => file.name)), path: null, data: await pdfFromImages(files, decodeImage) };
}

export const pdfsIn = (files: OpenedFile[]) => files.flatMap((file) => (file.kind === "pdf" ? [file.source] : []));

export const imagesIn = (files: OpenedFile[]) => files.flatMap((file) => (file.kind === "image" ? [file.image] : []));

export const markdownIn = (files: OpenedFile[]) => files.flatMap((file) => (file.kind === "markdown" ? [file.source] : []));

export async function pagesFrom(files: OpenedFile[]) {
  const runs = groupRuns(files, (file) => file.kind);
  const sources = await Promise.all(
    runs.flatMap(({ key, items }) => (key === "pdf" ? pdfsIn(items) : key === "image" ? [imagesToSource(imagesIn(items))] : [])),
  );
  if (!sources.length) {
    return null;
  }
  return sources.length === 1 ? sources[0].data : combinePdfs(sources.map((source) => source.data));
}
