import {
  LineCapStyle,
  LineJoinStyle,
  PDFHexString,
  PDFName,
  StandardFontEmbedder,
  StandardFonts,
  beginText,
  concatTransformationMatrix,
  drawSvgPath,
  endText,
  moveText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineJoin,
  showText,
  type PDFContext,
  type PDFOperator,
  type PDFRef,
} from "@cantoo/pdf-lib";
import { isMeasureKind, isTextKind, type Markup } from "./markup";
import { lineEndings, outlinePath, segmentsPath, stampMatrix, textMarkupSegments } from "./markupShapes";
import { CAPTION_SIZE, captionBaseline, captionPlacement, captionText, vertexPath } from "./measureMarkup";
import { CAP_HEIGHT, stampDesign, type StampDesign } from "./stampSymbols";

const FONT = "HeBo";
const CAPTION_FONT = "Helv";
const FLIP = [1, 0, 0, -1, 0, 0] as [number, number, number, number, number, number];

type FontName = Parameters<typeof StandardFontEmbedder.for>[0];
const embedders = new Map<string, StandardFontEmbedder>();
const embedder = (font: StandardFonts) => embedders.get(font) ?? embedders.set(font, StandardFontEmbedder.for(font as unknown as FontName)).get(font)!;
const bold = () => embedder(StandardFonts.HelveticaBold);
const regular = () => embedder(StandardFonts.Helvetica);

export const winAnsiSafe = (text: string) => text.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

const colorOf = (values: number[]) => rgb(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0);

function stroked(d: string, markup: Markup, extra: { width?: number; matrix?: number[]; cap?: boolean } = {}) {
  return drawSvgPath(d, {
    x: 0,
    y: 0,
    scale: undefined,
    matrix: (extra.matrix ?? FLIP) as typeof FLIP,
    color: undefined,
    borderColor: colorOf(markup.color),
    borderWidth: extra.width ?? markup.width,
    borderDashArray: markup.dash ?? undefined,
    borderLineCap: extra.cap ? LineCapStyle.Round : undefined,
    graphicsState: "GS",
  });
}

function filled(d: string, color: number[], state: string, matrix: number[] = FLIP) {
  return drawSvgPath(d, { x: 0, y: 0, scale: undefined, matrix: matrix as typeof FLIP, color: colorOf(color), borderColor: undefined, borderWidth: 0, graphicsState: state });
}

function labelOperators(design: StampDesign, color: number[]) {
  const font = bold();
  return design.labels.flatMap((label) => {
    const text = winAnsiSafe(label.text);
    const width = font.widthOfTextAtSize(text, label.size);
    return [
      pushGraphicsState(),
      concatTransformationMatrix(1, 0, 0, -1, label.x, label.y),
      beginText(),
      setFillingRgbColor(color[0], color[1], color[2]),
      setFontAndSize(FONT, label.size),
      moveText(-width / 2, (-label.size * CAP_HEIGHT) / 2),
      showText(font.encodeText(text) as PDFHexString),
      endText(),
      popGraphicsState(),
    ];
  });
}

function stampOperators(markup: Markup, design: StampDesign) {
  const matrix = stampMatrix(markup.box, markup.rotation, design.width, design.height);
  const [a, b, c, d, e, f] = matrix;
  const flipped = [a, b, -c, -d, e, f];
  const shapes = design.shapes.flatMap((shape) =>
    shape.fill ? filled(shape.d, markup.color, "GS", flipped) : stroked(shape.d, markup, { width: shape.strokeWidth ?? design.strokeWidth, matrix: flipped, cap: true }),
  );
  const labels = design.labels.length ? [pushGraphicsState(), setGraphicsState("GS"), concatTransformationMatrix(a, b, c, d, e, f), ...labelOperators(design, markup.color), popGraphicsState()] : [];
  return [setLineJoin(LineJoinStyle.Round), ...shapes, ...labels];
}

function captionOperators(markup: Markup) {
  const text = winAnsiSafe(captionText(markup));
  if (!text) {
    return [];
  }
  const font = regular();
  const placement = captionPlacement(markup);
  const [cos, sin] = [Math.cos(placement.angle), Math.sin(placement.angle)];
  return [
    pushGraphicsState(),
    setGraphicsState("GS"),
    concatTransformationMatrix(cos, sin, -sin, cos, placement.x, placement.y),
    beginText(),
    setFillingRgbColor(markup.color[0] ?? 0, markup.color[1] ?? 0, markup.color[2] ?? 0),
    setFontAndSize(CAPTION_FONT, CAPTION_SIZE),
    moveText(-font.widthOfTextAtSize(text, CAPTION_SIZE) / 2, captionBaseline(placement)),
    showText(font.encodeText(text) as PDFHexString),
    endText(),
    popGraphicsState(),
  ];
}

function shapeOperators(markup: Markup): PDFOperator[] {
  switch (markup.kind) {
    case "rectangle":
    case "ellipse":
    case "cloud": {
      const d = outlinePath(markup.kind, markup.box);
      return [setLineJoin(LineJoinStyle.Round), ...(markup.fill ? filled(d, markup.fill, "GF") : []), ...(markup.width > 0 ? stroked(d, markup) : [])];
    }
    case "line":
    case "arrow":
    case "measure-length": {
      const [x1, y1, x2, y2] = markup.line ?? markup.box;
      const endings = lineEndings(markup).flatMap((ending) => (ending.closed ? [...filled(ending.d, markup.fill ?? markup.color, "GS"), ...stroked(ending.d, markup, { cap: true })] : stroked(ending.d, markup, { cap: true })));
      return [setLineJoin(LineJoinStyle.Round), ...stroked(`M ${x1} ${y1} L ${x2} ${y2}`, markup, { cap: true }), ...endings];
    }
    case "underline":
    case "strikeout":
      return stroked(segmentsPath(textMarkupSegments(markup.kind, markup.quads ?? [], markup.width)), markup);
    case "stamp": {
      const design = markup.stamp ? stampDesign(markup.stamp, markup.stampDate) : null;
      return design ? stampOperators(markup, design) : [];
    }
    case "measure-path":
    case "measure-area": {
      const d = vertexPath(markup.vertices ?? [], markup.kind === "measure-area");
      return [setLineJoin(LineJoinStyle.Round), ...(markup.fill ? filled(d, markup.fill, "GF") : []), ...(markup.width > 0 ? stroked(d, markup) : [])];
    }
  }
}

export function appearanceOperators(markup: Markup): PDFOperator[] {
  return isMeasureKind(markup.kind) ? [...shapeOperators(markup), ...captionOperators(markup)] : shapeOperators(markup);
}

export function needsFont(markup: Markup) {
  return markup.kind === "stamp" && !!markup.stamp && !!stampDesign(markup.stamp, markup.stampDate)?.labels.length;
}

export type AppearanceFonts = { bold: () => PDFRef; regular: () => PDFRef };

export function addAppearance(context: PDFContext, markup: Markup, bbox: number[], fonts: AppearanceFonts): PDFRef {
  const opacity = Math.min(1, Math.max(0, markup.opacity));
  const resources = context.obj({
    ExtGState: {
      GS: { Type: "ExtGState", CA: opacity, ca: opacity },
      GF: { Type: "ExtGState", CA: opacity, ca: opacity * Math.min(1, Math.max(0, markup.fillAlpha)) },
    },
  });
  if (needsFont(markup)) {
    resources.set(PDFName.of("Font"), context.obj({ [FONT]: fonts.bold() }));
  } else if (isMeasureKind(markup.kind)) {
    resources.set(PDFName.of("Font"), context.obj({ [CAPTION_FONT]: fonts.regular() }));
  }
  const operators = isTextKind(markup.kind) && !markup.quads?.length ? [] : appearanceOperators(markup);
  return context.register(context.formXObject(operators, { BBox: bbox, Resources: resources }));
}

export function fontDict(context: PDFContext, baseFont: "Helvetica" | "Helvetica-Bold") {
  return context.register(context.obj({ Type: "Font", Subtype: "Type1", BaseFont: baseFont, Encoding: "WinAnsiEncoding" }));
}
