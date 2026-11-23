import { PDFString, type PDFDocument, type PDFRef } from "@cantoo/pdf-lib";

export type OcrWord = { text: string; left: number; top: number; right: number; bottom: number; lineEnd: boolean };
export type OcrPage = { pageIndex: number; width: number; height: number; words: OcrWord[] };
type Box = { x: number; y: number; width: number; height: number };
type Matrix = [number, number, number, number, number, number];

const GLYPHLESS_TTF = "AAEAAAAKAIAAAwAgT1MvMlbeyJQAAAEoAAAAYGNtYXAACgA0AAABkAAAAB5nbHlmFSJBJAAAAbgAAAAYaGVhZAt48WUAAACsAAAANmhoZWEMAgQCAAAA5AAAACRobXR4BAAAAAAAAYgAAAAIbG9jYQAMAAAAAAGwAAAABm1heHAABAAFAAABCAAAACBuYW1l8usW2gAAAdAAAABLcG9zdAABAAEAAAIcAAAAIAABAAAAAQAAsJRxEF8PPPUEBwgAAAAAAM+a/G4AAAAA1MOn8gAAAAAEAAgAAAAAEAACAAAAAAAAAAEAAAgA//8AAAQAAAAAAAQAAAEAAAAAAAAAAAAAAAAAAAACAAEAAAACAAQAAQAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAwAAAZAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAR09PRwBAAAAAAAAB//8AAAABAAGAAAAAAAAAAAAAAAAAAAABAAAAAAAABAAAAAAAAAIAAQAAAAAAFAADAAAAAAAUAAYACgAAAAAAAAAAAAAAAAAMAAAAAQAAAAAEAAgAAAMAADEhESEEAPwACAAAAAADACoAAAADAAAABQAWAAAAAQAAAAAABQALABYAAwABBAkABQAWAAAAVgBlAHIAcwBpAG8AbgAgADEALgAwVmVyc2lvbiAxLjAAAAEAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAA=";
const GLYPH_WIDTH = 0.5;

const TO_UNICODE = [
  "/CIDInit /ProcSet findresource begin",
  "12 dict begin",
  "begincmap",
  "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
  "/CMapName /Adobe-Identify-UCS def",
  "/CMapType 2 def",
  "1 begincodespacerange",
  "<0000> <FFFF>",
  "endcodespacerange",
  "1 beginbfrange",
  "<0000> <FFFF> <0000>",
  "endbfrange",
  "endcmap",
  "CMapName currentdict /CMap defineresource pop",
  "end",
  "end",
].join("\n");

export function visibleBox(crop: Box, media: Box): Box {
  const x = Math.max(crop.x, media.x);
  const y = Math.max(crop.y, media.y);
  const width = Math.min(crop.x + crop.width, media.x + media.width) - x;
  const height = Math.min(crop.y + crop.height, media.y + media.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : media;
}

export function imageToPage(box: Box, rotation: number, imageWidth: number): Matrix {
  const turns = rotation % 90 === 0 ? (((rotation / 90) % 4) + 4) % 4 : 0;
  const unit = (turns % 2 ? box.height : box.width) / imageWidth;
  const right = box.x + box.width;
  const top = box.y + box.height;
  if (turns === 1) {
    return [0, unit, unit, 0, box.x, box.y];
  }
  if (turns === 2) {
    return [-unit, 0, 0, unit, right, box.y];
  }
  if (turns === 3) {
    return [0, -unit, -unit, 0, right, top];
  }
  return [unit, 0, 0, -unit, box.x, top];
}

const number = (value: number) => (Math.round(value * 10000) / 10000).toString();

function hexOf(text: string) {
  let hex = "";
  for (let index = 0; index < text.length; index++) {
    hex += text.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return hex;
}

const printable = (text: string) => text.replace(/[\u0000-\u001f\u007f]/g, "");

export function textLayerContent(words: OcrWord[], [a, b, c, d, e, f]: Matrix, font: string) {
  const lines = ["q", "BT", "3 Tr", `/${font} 1 Tf`];
  words.forEach((word, index) => {
    const next = word.lineEnd ? undefined : words[index + 1];
    const text = printable(word.text) + (next ? " " : "");
    const width = (next && next.left > word.right ? next.left : word.right) - word.left;
    const height = word.bottom - word.top;
    if (!text.trim() || width <= 0 || height <= 0) {
      return;
    }
    const stretch = width / (text.length * GLYPH_WIDTH);
    const matrix = [a * stretch, b * stretch, -c * height, -d * height, a * word.left + c * word.bottom + e, b * word.left + d * word.bottom + f];
    lines.push(`${matrix.map(number).join(" ")} Tm`, `<${hexOf(text)}> Tj`);
  });
  lines.push("ET", "Q");
  return lines.join("\n");
}

function glyphlessFont(doc: PDFDocument) {
  const { context } = doc;
  const file = context.register(context.flateStream(Uint8Array.from(atob(GLYPHLESS_TTF), (char) => char.charCodeAt(0))));
  const descriptor = context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: "GlyphLessFont",
      Flags: 5,
      FontBBox: [0, 0, 500, 1000],
      ItalicAngle: 0,
      Ascent: 1000,
      Descent: -1,
      CapHeight: 1000,
      StemV: 80,
      FontFile2: file,
    }),
  );
  const cidToGid = new Uint8Array(0x20000);
  for (let index = 1; index < cidToGid.length; index += 2) {
    cidToGid[index] = 1;
  }
  const descendant = context.register(
    context.obj({
      Type: "Font",
      Subtype: "CIDFontType2",
      BaseFont: "GlyphLessFont",
      CIDSystemInfo: context.obj({ Registry: PDFString.of("Adobe"), Ordering: PDFString.of("Identity"), Supplement: 0 }),
      FontDescriptor: descriptor,
      DW: 1000 * GLYPH_WIDTH,
      CIDToGIDMap: context.register(context.flateStream(cidToGid)),
    }),
  );
  return context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "GlyphLessFont",
      Encoding: "Identity-H",
      DescendantFonts: [descendant],
      ToUnicode: context.register(context.flateStream(TO_UNICODE)),
    }),
  );
}

export function addTextLayers(doc: PDFDocument, pages: OcrPage[]) {
  let font: PDFRef | null = null;
  const all = doc.getPages();
  for (const { pageIndex, width, words } of pages) {
    const page = all[pageIndex];
    if (!page || !words.length) {
      continue;
    }
    const box = visibleBox(page.getCropBox(), page.getMediaBox());
    page.node.normalize();
    const name = page.node.newFontDictionary("ClumsyOcr", (font ??= glyphlessFont(doc)));
    const content = textLayerContent(words, imageToPage(box, page.getRotation().angle, width), name.decodeText());
    page.node.addContentStream(doc.context.register(doc.context.flateStream(content)));
  }
}
