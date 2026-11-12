import {
  LineCapStyle,
  LineJoinStyle,
  PDFHexString,
  StandardFontEmbedder,
  StandardFonts,
  beginText,
  drawSvgPath,
  endText,
  moveText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingRgbColor,
  setFontAndSize,
  setLineJoin,
  showText,
  type PDFContext,
  type PDFOperator,
  type PDFRef,
} from "@cantoo/pdf-lib";
import { toEncodable } from "./comparisonReport";
import type { SignatureAppearance } from "./signatureTypes";

type Box = { x: number; y: number; width: number; height: number };
type Matrix = [number, number, number, number, number, number];

const FONT = "Helv";
const INK = rgb(0.05, 0.05, 0.15);
const TEXT_COLOR = [0.1, 0.1, 0.1] as const;
const LINE_HEIGHT = 1.25;
const MAX_FONT_SIZE = 14;
const PADDING = 0.06;
const WIDE = 1.6;

let embedder: StandardFontEmbedder | null = null;
const helvetica = () => (embedder ??= StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as Parameters<typeof StandardFontEmbedder.for>[0]));

let supported: Set<number> | null = null;
const supportedCodePoints = () => (supported ??= new Set((helvetica().encoding as unknown as { supportedCodePoints: number[] }).supportedCodePoints));

export const winAnsiLine = (text: string) => toEncodable(text.replace(/[\r\n\t]+/g, " "), supportedCodePoints());

export function rotationMatrix(rotation: number, width: number, height: number): Matrix {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [0, 1, -1, 0, height, 0];
    case 180:
      return [-1, 0, 0, -1, width, height];
    case 270:
      return [0, -1, 1, 0, 0, width];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

export const isQuarterTurn = (rotation: number) => ((rotation % 180) + 180) % 180 === 90;

export function splitBox(width: number, height: number, hasOutline: boolean, hasText: boolean): { outline: Box | null; text: Box | null } {
  const padX = Math.min(width, height) * PADDING;
  const inner: Box = { x: padX, y: padX, width: Math.max(0, width - padX * 2), height: Math.max(0, height - padX * 2) };
  if (!hasOutline || !hasText) {
    return { outline: hasOutline ? inner : null, text: hasText ? inner : null };
  }
  if (inner.width >= inner.height * WIDE) {
    const split = inner.width * 0.45;
    return {
      outline: { ...inner, width: split - padX / 2 },
      text: { x: inner.x + split + padX / 2, y: inner.y, width: inner.width - split - padX / 2, height: inner.height },
    };
  }
  const split = inner.height * 0.45;
  return {
    outline: { x: inner.x, y: inner.y + split + padX / 2, width: inner.width, height: inner.height - split - padX / 2 },
    text: { ...inner, height: split - padX / 2 },
  };
}

function outlineOperators(outline: NonNullable<SignatureAppearance["outline"]>, box: Box): PDFOperator[] {
  const [vx, vy, vw, vh] = outline.viewBox;
  if (!(vw > 0 && vh > 0) || !(box.width > 0 && box.height > 0) || !outline.path.trim()) {
    return [];
  }
  const scale = Math.min(box.width / vw, box.height / vh);
  const left = box.x + (box.width - vw * scale) / 2;
  const top = box.y + box.height - (box.height - vh * scale) / 2;
  const placement = { x: left - vx * scale, y: top + vy * scale, scale };
  const operators = outline.areContours
    ? drawSvgPath(outline.path, { ...placement, color: INK, borderColor: undefined, borderWidth: 0 })
    : drawSvgPath(outline.path, { ...placement, color: undefined, borderColor: INK, borderWidth: Math.max(outline.thickness, 0.1), borderLineCap: LineCapStyle.Round });
  return [setLineJoin(LineJoinStyle.Round), ...operators];
}

export function fontSizeFor(lines: string[], box: Box) {
  const font = helvetica();
  const byHeight = box.height / (lines.length * LINE_HEIGHT);
  const byWidth = Math.min(...lines.map((line) => (line ? box.width / font.widthOfTextAtSize(line, 1) : Infinity)));
  return Math.max(0, Math.min(MAX_FONT_SIZE, byHeight, byWidth));
}

function textOperators(lines: string[], box: Box): PDFOperator[] {
  const font = helvetica();
  const size = fontSizeFor(lines, box);
  if (!(size > 0)) {
    return [];
  }
  const lineHeight = size * LINE_HEIGHT;
  const top = box.y + (box.height + lines.length * lineHeight) / 2;
  return lines.flatMap((line, index) =>
    line
      ? [
          beginText(),
          setFillingRgbColor(...TEXT_COLOR),
          setFontAndSize(FONT, size),
          moveText(box.x, top - (index + 1) * lineHeight + (lineHeight - size) / 2 + size * 0.22),
          showText(font.encodeText(line) as PDFHexString),
          endText(),
        ]
      : [],
  );
}

export function appearanceOperators(appearance: SignatureAppearance, width: number, height: number): PDFOperator[] {
  const lines = appearance.lines.map(winAnsiLine);
  const hasText = lines.some((line) => line.trim());
  const boxes = splitBox(width, height, !!appearance.outline, hasText);
  return [
    pushGraphicsState(),
    ...(appearance.outline && boxes.outline ? outlineOperators(appearance.outline, boxes.outline) : []),
    ...(boxes.text ? textOperators(lines, boxes.text) : []),
    popGraphicsState(),
  ];
}

export function addSignatureAppearance(context: PDFContext, appearance: SignatureAppearance | null, rect: number[], rotation: number): PDFRef {
  const rectWidth = Math.abs(rect[2] - rect[0]);
  const rectHeight = Math.abs(rect[3] - rect[1]);
  const [width, height] = isQuarterTurn(rotation) ? [rectHeight, rectWidth] : [rectWidth, rectHeight];
  const operators = appearance ? appearanceOperators(appearance, width, height) : [];
  const usesFont = operators.some((operator) => operator.toString().endsWith(" Tf"));
  const resources = usesFont ? { Font: { [FONT]: helvetica().embedIntoContext(context) } } : {};
  return context.register(context.formXObject(operators, { BBox: [0, 0, width, height], Matrix: rotationMatrix(rotation, width, height), Resources: resources }));
}
