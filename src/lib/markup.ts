export const MARKUP_KEY_PREFIX = "clumsy-markup:";
export const STAMP_NAME_PREFIX = "Clumsy:";
export const FILL_ALPHA = 0.3;

export type ShapeKind = "rectangle" | "ellipse" | "cloud" | "line" | "arrow";
export type TextMarkupKind = "underline" | "strikeout";
export type MarkupKind = ShapeKind | TextMarkupKind | "stamp";

export const shapeKinds: ShapeKind[] = ["rectangle", "ellipse", "cloud", "line", "arrow"];

export type MarkupStyle = { color: number[]; fill: boolean; width: number; opacity: number };

export type Markup = {
  id: string;
  pageIndex: number;
  kind: MarkupKind;
  box: number[];
  line: number[] | null;
  quads: number[] | null;
  color: number[];
  fill: number[] | null;
  fillAlpha: number;
  width: number;
  opacity: number;
  dash: number[] | null;
  endings: string[] | null;
  stamp: string | null;
  stampDate: string | null;
  rotation: number;
  date: string | null;
  fresh: boolean;
  deleted: boolean;
};

const LINE = 4;
const SQUARE = 5;
const CIRCLE = 6;
const UNDERLINE = 10;
const STRIKEOUT = 12;
const STAMP = 13;

const claimedTypes = new Set([LINE, SQUARE, CIRCLE, UNDERLINE, STRIKEOUT]);
export const markupTypes = new Set([...claimedTypes, STAMP]);

type AnnotationInfo = { annotationType: number; inReplyTo?: unknown; id?: string };

export const isClaimedShape = (annotation: AnnotationInfo) => claimedTypes.has(annotation.annotationType) && !annotation.inReplyTo;

export const isStamp = (annotation: AnnotationInfo) => annotation.annotationType === STAMP;

export const mayBeMarkup = (annotation: AnnotationInfo) => markupTypes.has(annotation.annotationType) && !annotation.inReplyTo;

export const isLineKind = (kind: MarkupKind) => kind === "line" || kind === "arrow";
export const isTextKind = (kind: MarkupKind): kind is TextMarkupKind => kind === "underline" || kind === "strikeout";
export const isBoxKind = (kind: MarkupKind) => kind === "rectangle" || kind === "ellipse" || kind === "cloud" || kind === "stamp";

export function normalizeBox([x1, y1, x2, y2]: number[]) {
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

export function quadsBox(quads: number[]) {
  const xs = quads.filter((_, index) => index % 2 === 0);
  const ys = quads.filter((_, index) => index % 2 === 1);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export const hasOwnedChanges = (storage: Iterable<[string, unknown]>, notePrefix: string) =>
  [...storage].some(([key]) => key.startsWith(MARKUP_KEY_PREFIX) || key.startsWith(notePrefix));

export function markupIn(storage: Iterable<[string, unknown]>) {
  const changes: Markup[] = [];
  for (const [key, value] of storage) {
    if (key.startsWith(MARKUP_KEY_PREFIX)) {
      changes.push(value as Markup);
    }
  }
  return changes;
}

export function visibleMarkup(fileMarkup: Markup[], changes: Markup[], pageIndex?: number) {
  const changed = new Map(changes.map((markup) => [markup.id, markup]));
  const all = [...fileMarkup.map((markup) => changed.get(markup.id) ?? markup), ...changes.filter((markup) => markup.fresh)];
  return all.filter((markup) => !markup.deleted && (pageIndex === undefined || markup.pageIndex === pageIndex));
}

export const editedFileIds = (changes: Markup[]) => new Set(changes.filter((markup) => !markup.fresh).map((markup) => markup.id));

type NewMarkup = Pick<Markup, "id" | "pageIndex" | "kind" | "box"> & Partial<Markup>;

export function newMarkup(fields: NewMarkup, style: MarkupStyle, date: string): Markup {
  return {
    line: null,
    quads: null,
    color: style.color,
    fill: style.fill ? style.color : null,
    fillAlpha: FILL_ALPHA,
    width: style.width,
    opacity: style.opacity,
    dash: null,
    endings: fields.kind === "arrow" ? ["None", "OpenArrow"] : fields.kind === "line" ? ["None", "None"] : null,
    stamp: null,
    stampDate: null,
    rotation: 0,
    date,
    fresh: true,
    deleted: false,
    ...fields,
    box: normalizeBox(fields.box),
  };
}

export function movedMarkup(markup: Markup, dx: number, dy: number, date: string): Markup {
  const shift = (values: number[] | null) => values && values.map((value, index) => value + (index % 2 ? dy : dx));
  return { ...markup, box: shift(markup.box)!, line: shift(markup.line), quads: shift(markup.quads), date };
}

export function reshapedMarkup(markup: Markup, geometry: { box?: number[]; line?: number[] }, date: string): Markup {
  if (geometry.line) {
    const [x1, y1, x2, y2] = geometry.line;
    return { ...markup, line: geometry.line, box: normalizeBox([x1, y1, x2, y2]), date };
  }
  return { ...markup, box: normalizeBox(geometry.box ?? markup.box), date };
}

const sameColor = (a: number[], b: number[]) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1 / 512);

const fillable = (kind: MarkupKind) => kind === "rectangle" || kind === "ellipse" || kind === "cloud";

export function restyledMarkup(markup: Markup, style: Partial<MarkupStyle>, date: string): Markup {
  const color = style.color ?? markup.color;
  const filled = style.fill ?? markup.fill !== null;
  const canFill = fillable(markup.kind);
  const followsStroke = markup.fill === null || sameColor(markup.fill, markup.color);
  const fill = canFill ? (filled ? (followsStroke ? color : markup.fill) : null) : isLineKind(markup.kind) ? markup.fill : null;
  return {
    ...markup,
    color,
    fill,
    fillAlpha: canFill && filled && markup.fill === null ? FILL_ALPHA : markup.fillAlpha,
    width: markup.kind === "stamp" ? markup.width : (style.width ?? markup.width),
    opacity: style.opacity ?? markup.opacity,
    date,
  };
}

export const removedMarkup = (markup: Markup, date: string): Markup | null => (markup.fresh ? null : { ...markup, deleted: true, date });

export const sameStyle = (markup: Markup, style: Partial<MarkupStyle>) =>
  (style.color === undefined || sameColor(style.color, markup.color)) &&
  (style.fill === undefined || !fillable(markup.kind) || style.fill === (markup.fill !== null)) &&
  (style.width === undefined || markup.kind === "stamp" || style.width === markup.width) &&
  (style.opacity === undefined || style.opacity === markup.opacity);

export function hexColor(color: number[]) {
  return `#${color.map((value) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function colorFromHex(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  const digits = match ? match[1] : "e5484d";
  return [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16) / 255);
}

export const kindLabels: Record<MarkupKind, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  cloud: "Cloud",
  line: "Line",
  arrow: "Arrow",
  underline: "Underline",
  strikeout: "Strikethrough",
  stamp: "Stamp",
};
