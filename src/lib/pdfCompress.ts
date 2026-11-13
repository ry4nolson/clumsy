import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from "@cantoo/pdf-lib";
import { MAX_IMAGE_PIXELS, MIN_IMAGE_BYTES, targetSize, worthReplacing, type CompressProgress, type CompressSettings, type Size } from "./compressPlan";
import { IDENTITY, drawnSize, multiply, placementsIn, type Matrix } from "./contentPlacements";
import { jpegInfo, jpegWithoutMetadata, toRgba, unpredict } from "./imagePixels";
import { flattenPageTree } from "./pdfStructure";

export type ImageSource = { kind: "jpeg"; bytes: Uint8Array } | { kind: "pixels"; rgba: Uint8ClampedArray; width: number; height: number };

export type ImageCodec = (source: ImageSource, size: Size, quality: number) => Promise<Uint8Array | null>;

type Candidate = { ref: PDFRef; stream: PDFRawStream; jpeg: boolean; components: 1 | 3; width: number; height: number };

const key = PDFName.of;
const LOSSLESS = new Set(["FlateDecode", "LZWDecode", "ASCII85Decode", "ASCIIHexDecode", "RunLengthDecode"]);
const MAX_FORM_DEPTH = 12;
const MAX_STREAMS_WALKED = 20_000;

const numberIn = (dict: PDFDict | undefined, name: string) => {
  const value = dict?.lookup(key(name));
  return value instanceof PDFNumber ? value.asNumber() : undefined;
};

const isImage = (object: unknown): object is PDFRawStream => object instanceof PDFRawStream && object.dict.lookup(key("Subtype")) === key("Image");

function filtersOf(dict: PDFDict) {
  const filter = dict.lookup(key("Filter"));
  const list = filter instanceof PDFArray ? filter.asArray().map((_, index) => filter.lookup(index)) : filter ? [filter] : [];
  return list.every((item) => item instanceof PDFName) ? list.map((item) => (item as PDFName).decodeText()) : null;
}

function componentsOf(dict: PDFDict): 1 | 3 | null {
  const space = dict.lookup(key("ColorSpace"));
  const family = space instanceof PDFArray ? space.lookup(0) : space;
  if (family === key("DeviceRGB") || family === key("CalRGB")) {
    return 3;
  }
  if (family === key("DeviceGray") || family === key("CalGray")) {
    return 1;
  }
  if (family === key("ICCBased") && space instanceof PDFArray) {
    const profile = space.lookup(1);
    const count = profile instanceof PDFStream ? numberIn(profile.dict, "N") : undefined;
    return count === 1 || count === 3 ? count : null;
  }
  return null;
}

function plainDecode(dict: PDFDict, components: number) {
  const decode = dict.lookup(key("Decode"));
  if (!decode) {
    return true;
  }
  const values = decode instanceof PDFArray ? decode.asArray().map((_, index) => decode.lookup(index)) : [];
  return values.length === components * 2 && values.every((value, index) => value instanceof PDFNumber && value.asNumber() === index % 2);
}

function candidateOf(ref: PDFRef, stream: PDFRawStream): Candidate | null {
  const { dict } = stream;
  const filters = filtersOf(dict);
  const components = componentsOf(dict);
  const width = numberIn(dict, "Width");
  const height = numberIn(dict, "Height");
  const soft = dict.lookup(key("SMask"));
  if (!filters || !components || !width || !height || width * height > MAX_IMAGE_PIXELS || stream.contents.length < MIN_IMAGE_BYTES) {
    return null;
  }
  if (dict.lookup(key("ImageMask")) === PDFBool.True || numberIn(dict, "BitsPerComponent") !== 8 || !plainDecode(dict, components)) {
    return null;
  }
  if (dict.lookup(key("Mask")) instanceof PDFArray || (soft instanceof PDFStream && soft.dict.has(key("Matte")))) {
    return null;
  }
  const jpeg = filters.length === 1 && filters[0] === "DCTDecode";
  const lossless = filters.every((filter) => LOSSLESS.has(filter)) && (filters.length <= 1 || !dict.has(key("DecodeParms")));
  if (jpeg ? dict.has(key("DecodeParms")) : !lossless) {
    return null;
  }
  return { ref, stream, jpeg, components, width, height };
}

function sourceOf({ stream, jpeg, components, width, height }: Candidate): ImageSource | null {
  if (jpeg) {
    const info = jpegInfo(stream.contents);
    return info?.precision === 8 && info.components === components ? { kind: "jpeg", bytes: jpegWithoutMetadata(stream.contents) } : null;
  }
  const listed = stream.dict.lookup(key("DecodeParms"));
  const parms = listed instanceof PDFArray ? listed.lookup(0) : listed;
  const dict = parms instanceof PDFDict ? parms : undefined;
  const predictor = numberIn(dict, "Predictor") ?? 1;
  const described = (numberIn(dict, "Colors") ?? 1) === components && (numberIn(dict, "Columns") ?? 1) === width && (numberIn(dict, "BitsPerComponent") ?? 8) === 8;
  if (predictor > 1 && !described) {
    return null;
  }
  const rgba = toRgba(unpredict(decodePDFRawStream(stream).decode(), predictor, width, components), width, height, components);
  return rgba && { kind: "pixels", rgba, width, height };
}

function matrixOf(dict: PDFDict): Matrix {
  const matrix = dict.lookup(key("Matrix"));
  const values = matrix instanceof PDFArray ? matrix.asArray().map((_, index) => matrix.lookup(index)) : [];
  return values.length === 6 && values.every((value) => value instanceof PDFNumber) ? (values.map((value) => (value as PDFNumber).asNumber()) as Matrix) : IDENTITY;
}

function pageContent(page: PDFDict) {
  const contents = page.lookup(key("Contents"));
  const streams = contents instanceof PDFArray ? contents.asArray().map((_, index) => contents.lookup(index)) : contents ? [contents] : [];
  const parts = streams.map((stream) => decodePDFRawStream(stream as PDFRawStream).decode());
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length + 1, 0)).fill(10);
  let at = 0;
  for (const part of parts) {
    joined.set(part, at);
    at += part.length + 1;
  }
  return joined;
}

export function drawnSizes(doc: PDFDocument, pages: PDFRef[]) {
  const sizes = new Map<PDFRef, Size>();
  const open = new Set<PDFRawStream>();
  let walked = 0;
  const walk = (content: Uint8Array, resources: PDFDict | undefined, base: Matrix) => {
    walked += 1;
    if (walked > MAX_STREAMS_WALKED) {
      throw new Error("Too many nested forms.");
    }
    const xobjects = resources?.lookup(key("XObject"));
    if (!(xobjects instanceof PDFDict)) {
      return;
    }
    for (const { name, matrix } of placementsIn(content, base)) {
      const ref = xobjects.get(key(name));
      const target = xobjects.lookup(key(name));
      if (!(target instanceof PDFRawStream)) {
        continue;
      }
      const subtype = target.dict.lookup(key("Subtype"));
      if (subtype === key("Image") && ref instanceof PDFRef) {
        const size = drawnSize(matrix);
        const known = sizes.get(ref);
        sizes.set(ref, { width: Math.max(known?.width ?? 0, size.width), height: Math.max(known?.height ?? 0, size.height) });
      } else if (subtype === key("Form") && !open.has(target) && open.size < MAX_FORM_DEPTH) {
        const own = target.dict.lookup(key("Resources"));
        open.add(target);
        walk(decodePDFRawStream(target).decode(), own instanceof PDFDict ? own : resources, multiply(matrixOf(target.dict), matrix));
        open.delete(target);
      }
    }
  };
  try {
    for (const ref of pages) {
      const page = doc.context.lookup(ref, PDFDict);
      const resources = page.lookup(key("Resources"));
      walk(pageContent(page), resources instanceof PDFDict ? resources : undefined, IDENTITY);
    }
  } catch {
    return new Map<PDFRef, Size>();
  }
  return sizes;
}

function candidatesIn(doc: PDFDocument) {
  const images = doc.context.enumerateIndirectObjects().filter((entry): entry is [PDFRef, PDFRawStream] => isImage(entry[1]));
  const masks = new Set(images.flatMap(([, image]) => [image.dict.get(key("SMask")), image.dict.get(key("Mask"))]));
  return images.flatMap(([ref, image]) => (masks.has(ref) ? [] : (candidateOf(ref, image) ?? [])));
}

function replace(doc: PDFDocument, candidate: Candidate, size: Size, bytes: Uint8Array) {
  const dict = candidate.stream.dict.clone(doc.context);
  dict.delete(key("DecodeParms"));
  dict.set(key("Filter"), key("DCTDecode"));
  dict.set(key("Width"), PDFNumber.of(size.width));
  dict.set(key("Height"), PDFNumber.of(size.height));
  if (candidate.components === 1) {
    dict.set(key("ColorSpace"), key("DeviceRGB"));
  }
  doc.context.assign(candidate.ref, PDFRawStream.of(dict, bytes));
}

export async function compressImages(doc: PDFDocument, settings: CompressSettings, codec: ImageCodec, onProgress?: (progress: CompressProgress) => void) {
  const drawn = drawnSizes(doc, flattenPageTree(doc));
  const candidates = candidatesIn(doc);
  let replaced = 0;
  for (const [done, candidate] of candidates.entries()) {
    onProgress?.({ done, total: candidates.length });
    const size = targetSize(candidate, drawn.get(candidate.ref) ?? null, settings.dpi);
    const bytes = await Promise.resolve()
      .then(() => sourceOf(candidate))
      .then((source) => source && codec(source, size, settings.quality))
      .catch(() => null);
    const encoded = bytes && jpegInfo(bytes);
    if (bytes && encoded && encoded.components === 3 && worthReplacing(candidate.stream.contents.length, bytes.length)) {
      replace(doc, candidate, size, bytes);
      replaced += 1;
    }
  }
  return { images: candidates.length, replaced };
}
