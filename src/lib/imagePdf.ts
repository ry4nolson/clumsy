import { PDFDocument, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState, type PDFImage } from "@cantoo/pdf-lib";
import { imagePageSize, jpegOrientation, orientationMatrix, orientedSize, sniffImageType, type Orientation } from "./imageFormats";

export type ImageFile = { name: string; data: Uint8Array };

export type DecodedImage = { format: "png" | "jpeg"; data: Uint8Array };

export type ImageDecoder = (image: ImageFile) => Promise<DecodedImage>;

const ownBuffer = (bytes: Uint8Array) => (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice());

async function embedAsIs(doc: PDFDocument, bytes: Uint8Array): Promise<{ image: PDFImage; orientation: Orientation } | null> {
  try {
    switch (sniffImageType(bytes)) {
      case "jpeg":
        return { image: await doc.embedJpg(ownBuffer(bytes)), orientation: jpegOrientation(bytes) };
      case "png":
        return { image: await doc.embedPng(ownBuffer(bytes)), orientation: 1 };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function embedImage(doc: PDFDocument, file: ImageFile, decode: ImageDecoder) {
  const direct = await embedAsIs(doc, file.data);
  if (direct) {
    return direct;
  }
  const decoded = await decode(file);
  const image = decoded.format === "png" ? await doc.embedPng(ownBuffer(decoded.data)) : await doc.embedJpg(ownBuffer(decoded.data));
  return { image, orientation: 1 as Orientation };
}

export async function addImagePage(doc: PDFDocument, file: ImageFile, decode: ImageDecoder) {
  const { image, orientation } = await embedImage(doc, file, decode);
  const shown = orientedSize(image.width, image.height, orientation);
  const { width, height } = imagePageSize(shown.width, shown.height);
  const page = doc.addPage([width, height]);
  const name = page.node.newXObject("Image", image.ref);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...orientationMatrix(orientation, width, height)), drawObject(name), popGraphicsState());
}

export async function pdfFromImages(files: ImageFile[], decode: ImageDecoder) {
  const doc = await PDFDocument.create();
  for (const file of files) {
    await addImagePage(doc, file, decode);
  }
  return doc.save({ addDefaultPage: false });
}

const withoutExtension = (name: string) => name.replace(/\.[^./\\]+$/, "") || name;

export function imagesPdfName(names: string[]) {
  const first = withoutExtension(names[0] ?? "Images");
  return names.length > 1 ? `${first} and ${names.length - 1} more.pdf` : `${first}.pdf`;
}

export function groupRuns<T, K>(items: T[], key: (item: T) => K) {
  const runs: Array<{ key: K; items: T[] }> = [];
  for (const item of items) {
    const kind = key(item);
    const last = runs.at(-1);
    if (last && last.key === kind) {
      last.items.push(item);
    } else {
      runs.push({ key: kind, items: [item] });
    }
  }
  return runs;
}
