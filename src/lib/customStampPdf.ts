import { JpegEmbedder, PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, PngEmbedder, decodePDFRawStream, type PDFContext, type PDFDocument } from "@cantoo/pdf-lib";
import { cleanName, cleanText, customStamp, isCustomId, type CustomStamp, type ImageStamp } from "./customStamps";
import { STAMP_NAME_PREFIX, type Markup } from "./markup";
import { toRgba } from "./imagePixels";
import { pageLeafRefs } from "./pdfStructure";
import { base64ToBytes, bytesToBase64 } from "./webviewPolyfills";

export const STAMP_IMAGE_KEY = PDFName.of("ClumsyStampImage");
export const STAMP_TEXT_KEY = PDFName.of("ClumsyStampText");
const MAX_SIDE = 4096;
export const MAX_RECONSTRUCTED_PIXELS = 16_777_216;

export type PixelStamp = { id: string; name: string; kind: "pixels"; width: number; height: number; rgba: Uint8ClampedArray };
export type FileStamp = CustomStamp | PixelStamp;

const name = (value: string) => PDFName.of(value);

const rawStream = (value: unknown) => (value instanceof PDFRawStream ? value : null);

function stampIdOf(dict: PDFDict) {
  const value = dict.lookupMaybe(name("Name"), PDFName)?.decodeText();
  const id = value?.startsWith(STAMP_NAME_PREFIX) ? value.slice(STAMP_NAME_PREFIX.length) : null;
  return id && isCustomId(id) ? id : null;
}

function annotations(doc: PDFDocument) {
  const { context } = doc;
  return pageLeafRefs(doc).flatMap((pageRef) => {
    const annots = context.lookupMaybe(pageRef, PDFDict)?.lookupMaybe(name("Annots"), PDFArray);
    return (annots?.asArray() ?? []).flatMap((entry) => {
      const dict = entry instanceof PDFRef ? context.lookupMaybe(entry, PDFDict) : undefined;
      return dict ? [dict] : [];
    });
  });
}

const isImage = (stream: PDFRawStream | null) =>
  !!stream && stream.dict.lookup(name("Subtype")) === name("Image") && !!numberOf(stream.dict, "Width") && !!numberOf(stream.dict, "Height");

function existingImages(doc: PDFDocument) {
  const found = new Map<string, PDFRef>();
  for (const dict of annotations(doc)) {
    const id = stampIdOf(dict);
    const ref = dict.get(STAMP_IMAGE_KEY);
    if (id && ref instanceof PDFRef && !found.has(id) && isImage(rawStream(doc.context.lookup(ref)))) {
      found.set(id, ref);
    }
  }
  return found;
}

async function embedImage(doc: PDFDocument, stamp: ImageStamp) {
  const bytes = base64ToBytes(stamp.data);
  const embedder = stamp.mime === "image/png" ? await PngEmbedder.for(bytes) : await JpegEmbedder.for(bytes);
  return embedder.embedIntoContext(doc.context);
}

export async function embedStampImages(doc: PDFDocument, markup: Markup[]) {
  const wanted = new Set(markup.flatMap((change) => (!change.deleted && change.stamp && customStamp(change.stamp)?.kind === "image" ? [change.stamp] : [])));
  const images = new Map<string, PDFRef>();
  if (!wanted.size) {
    return images;
  }
  const existing = existingImages(doc);
  for (const id of wanted) {
    const stamp = customStamp(id);
    const reused = existing.get(id);
    if (reused) {
      images.set(id, reused);
    } else if (stamp?.kind === "image") {
      const embedded = await embedImage(doc, stamp).catch(() => null);
      if (embedded) {
        images.set(id, embedded);
      }
    }
  }
  return images;
}

export function setStampKeys(dict: PDFDict, markup: Markup, image: PDFRef | undefined) {
  const stamp = markup.stamp ? customStamp(markup.stamp) : null;
  if (stamp?.kind === "text") {
    dict.set(STAMP_TEXT_KEY, PDFHexString.fromText(stamp.text));
  } else if (stamp?.kind === "image" && image) {
    dict.set(STAMP_IMAGE_KEY, image);
  }
}

const textOf = (value: unknown) => (value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : null);

function numberOf(dict: PDFDict, key: string) {
  const value = dict.lookupMaybe(name(key), PDFNumber)?.asNumber();
  return value !== undefined && Number.isInteger(value) && value > 0 && value <= MAX_SIDE ? value : null;
}

function filterOf(dict: PDFDict) {
  const filter = dict.lookup(name("Filter"));
  const only = filter instanceof PDFArray ? (filter.size() === 1 ? filter.lookup(0) : null) : filter;
  return only === undefined ? "none" : only instanceof PDFName ? only.decodeText() : null;
}

function componentsOf(dict: PDFDict) {
  const space = dict.lookup(name("ColorSpace"));
  return space === name("DeviceRGB") ? 3 : space === name("DeviceGray") ? 1 : null;
}

function plainDecode(dict: PDFDict) {
  const decode = dict.lookupMaybe(name("Decode"), PDFArray);
  return !decode || decode.asArray().every((_, index) => decode.lookupMaybe(index, PDFNumber)?.asNumber() === index % 2);
}

function samplesOf(stream: PDFRawStream, width: number, height: number, components: 1 | 3) {
  const { dict } = stream;
  const filter = filterOf(dict);
  if ((filter !== "FlateDecode" && filter !== "none") || dict.has(name("DecodeParms")) || !plainDecode(dict) || (dict.lookupMaybe(name("BitsPerComponent"), PDFNumber)?.asNumber() ?? 8) !== 8) {
    return null;
  }
  const samples = filter === "none" ? stream.contents : decodePDFRawStream(stream).decode();
  return samples.length >= width * height * components ? samples : null;
}

export function stampImageOf(context: PDFContext, ref: PDFRef, id: string, stampName: string): FileStamp | null {
  const found = rawStream(context.lookup(ref));
  const stream = isImage(found) ? found : null;
  const width = stream && numberOf(stream.dict, "Width");
  const height = stream && numberOf(stream.dict, "Height");
  const components = stream && componentsOf(stream.dict);
  if (!stream || !width || !height || !components) {
    return null;
  }
  const mask = rawStream(stream.dict.lookup(name("SMask")));
  if (filterOf(stream.dict) === "DCTDecode" && !mask) {
    return { id, name: stampName, kind: "image", mime: "image/jpeg", data: bytesToBase64(stream.contents), width, height };
  }
  const samples = samplesOf(stream, width, height, components);
  const rgba = samples && toRgba(samples, width, height, components);
  if (!rgba) {
    return null;
  }
  if (mask) {
    const sameSize = numberOf(mask.dict, "Width") === width && numberOf(mask.dict, "Height") === height && componentsOf(mask.dict) === 1;
    const alpha = sameSize ? samplesOf(mask, width, height, 1) : null;
    if (!alpha) {
      return null;
    }
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      rgba[pixel * 4 + 3] = alpha[pixel];
    }
  }
  return { id, name: stampName, kind: "pixels", width, height, rgba };
}

function imageSize(context: PDFContext, ref: PDFRef) {
  const stream = rawStream(context.lookup(ref));
  return stream ? (numberOf(stream.dict, "Width") ?? 0) * (numberOf(stream.dict, "Height") ?? 0) : 0;
}

export function readCustomStamps(doc: PDFDocument, known: Iterable<string> = []): FileStamp[] {
  const found = new Map<string, FileStamp>();
  const skip = new Set(known);
  let budget = MAX_RECONSTRUCTED_PIXELS;
  for (const dict of annotations(doc)) {
    const id = stampIdOf(dict);
    if (!id || found.has(id) || skip.has(id)) {
      continue;
    }
    const stampName = cleanName(textOf(dict.get(name("Subj"))) ?? "");
    const text = cleanText(textOf(dict.get(STAMP_TEXT_KEY)) ?? "");
    const image = dict.get(STAMP_IMAGE_KEY);
    const pixels = !text && image instanceof PDFRef ? imageSize(doc.context, image) : 0;
    if (pixels > budget) {
      skip.add(id);
      continue;
    }
    budget -= pixels;
    const stamp: FileStamp | null = text
      ? { id, name: stampName || text, kind: "text", text, color: [0, 0, 0], date: false }
      : image instanceof PDFRef
        ? stampImageOf(doc.context, image, id, stampName || "Image")
        : null;
    if (stamp) {
      found.set(id, stamp);
    }
  }
  return [...found.values()];
}
