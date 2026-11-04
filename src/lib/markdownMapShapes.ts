export type MapBox = { x: number; y: number; width: number; height: number; fill: string | null; edges: [number, number, number, number]; edgeColor: string | null };
export type MapImage = { image: HTMLImageElement; x: number; y: number; width: number; height: number };
export type MapHighlight = { x: number; y: number; width: number; height: number; color: string };
export type MapBars = { geometry: Float32Array; colors: string[]; colorIndex: Uint16Array; tallest: number };
export type MapShapes = { width: number; height: number; boxes: MapBox[]; bars: MapBars; images: MapImage[]; marks: MapHighlight[] };

const BOX_SELECTOR = "pre, code, blockquote, hr, h1, h2, tr, th, td, kbd, .missing-image";
const MUTED_SELECTOR = "blockquote, .footnotes, pre.front-matter";
const MARK_SELECTOR = "mark.find-match";
const BAR_INSET = 0.2;
const BAR_ALPHA = 0.45;
const MIN_MARK = 2;

type BoxStyle = Pick<MapBox, "fill" | "edges" | "edgeColor">;

const transparent = (color: string) => color === "transparent" || /rgba?\(.*,\s*0\)$/.test(color) || color.endsWith(" / 0)");

function boxStyle(element: Element): BoxStyle {
  const style = getComputedStyle(element);
  const edges: [number, number, number, number] = [
    parseFloat(style.borderTopWidth) || 0,
    parseFloat(style.borderRightWidth) || 0,
    parseFloat(style.borderBottomWidth) || 0,
    parseFloat(style.borderLeftWidth) || 0,
  ];
  const colors = [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor];
  const side = edges.findIndex((width) => width > 0);
  return {
    fill: transparent(style.backgroundColor) ? null : style.backgroundColor,
    edges,
    edgeColor: side < 0 ? null : colors[side],
  };
}

function boxKey(element: Element) {
  const parity = element.tagName === "TR" ? Array.prototype.indexOf.call(element.parentElement?.children ?? [], element) % 2 : "";
  return `${element.tagName}.${element.className}.${element.parentElement?.tagName}.${parity}`;
}

function textKey(element: Element) {
  return `${element.tagName}.${element.className}|${element.closest(MUTED_SELECTOR)?.tagName ?? ""}`;
}

export function collectMarks(article: HTMLElement): MapHighlight[] {
  const origin = article.getBoundingClientRect();
  const colors = new Map<string, string>();
  const marks: MapHighlight[] = [];
  for (const mark of article.querySelectorAll(MARK_SELECTOR)) {
    let color = colors.get(mark.className);
    if (!color) {
      color = getComputedStyle(mark).backgroundColor;
      colors.set(mark.className, color);
    }
    const rects = mark.getClientRects();
    for (let index = 0; index < rects.length; index++) {
      const rect = rects[index];
      marks.push({ x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height, color });
    }
  }
  return marks;
}

function collectBars(article: HTMLElement, origin: DOMRect): MapBars {
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const colors: string[] = [];
  const colorFor = new Map<string, number>();
  const found: number[] = [];
  let tallest = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    let parent = text.parentElement;
    if (!parent || !text.data.trim()) {
      continue;
    }
    if (parent.matches(MARK_SELECTOR) && parent.parentElement) {
      parent = parent.parentElement;
    }
    const key = textKey(parent);
    let color = colorFor.get(key);
    if (color === undefined) {
      const value = getComputedStyle(parent).color;
      color = colors.includes(value) ? colors.indexOf(value) : colors.push(value) - 1;
      colorFor.set(key, color);
    }
    range.selectNodeContents(text);
    const rects = range.getClientRects();
    for (let index = 0; index < rects.length; index++) {
      const rect = rects[index];
      if (rect.width > 0 && rect.height > 0) {
        found.push(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height, color);
        tallest = Math.max(tallest, rect.height);
      }
    }
  }
  return packBars(found, colors, tallest);
}

export function packBars(found: number[], colors: string[], tallest: number): MapBars {
  const count = found.length / 5;
  const order = Array.from({ length: count }, (_, index) => index).sort((a, b) => found[a * 5 + 1] - found[b * 5 + 1]);
  const geometry = new Float32Array(count * 4);
  const colorIndex = new Uint16Array(count);
  order.forEach((from, to) => {
    for (let field = 0; field < 4; field++) {
      geometry[to * 4 + field] = found[from * 5 + field];
    }
    colorIndex[to] = found[from * 5 + 4];
  });
  return { geometry, colors, colorIndex, tallest };
}

export function collectShapes(article: HTMLElement): MapShapes {
  const origin = article.getBoundingClientRect();
  const styles = new Map<string, BoxStyle>();
  const boxes: MapBox[] = [];
  for (const element of article.querySelectorAll(BOX_SELECTOR)) {
    const key = boxKey(element);
    let style = styles.get(key);
    if (!style) {
      style = boxStyle(element);
      styles.set(key, style);
    }
    if (!style.fill && !style.edgeColor) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      boxes.push({ x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height, ...style });
    }
  }
  const images = Array.from(article.querySelectorAll("img"), (image) => {
    const rect = image.getBoundingClientRect();
    return { image, x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
  }).filter((image) => image.width > 0 && image.height > 0);
  return { width: article.offsetWidth, height: article.offsetHeight, boxes, bars: collectBars(article, origin), images, marks: collectMarks(article) };
}

export function firstBarFrom(geometry: Float32Array, top: number) {
  let low = 0;
  let high = geometry.length / 4;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (geometry[middle * 4 + 1] < top) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

type PaintArea = { scale: number; offset: number; width: number; height: number; background: string };

export function paintShapes(context: CanvasRenderingContext2D, shapes: MapShapes, { scale, offset, width, height, background }: PaintArea) {
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  if (!scale) {
    return;
  }
  const top = offset / scale;
  const bottom = (offset + height) / scale;
  const visible = (y: number, extent: number) => y + extent >= top && y <= bottom;
  context.save();
  context.scale(scale, scale);
  context.translate(0, -top);
  for (const box of shapes.boxes) {
    if (!visible(box.y, box.height)) {
      continue;
    }
    if (box.fill) {
      context.fillStyle = box.fill;
      context.fillRect(box.x, box.y, box.width, box.height);
    }
    if (box.edgeColor) {
      const [edgeTop, edgeRight, edgeBottom, edgeLeft] = box.edges;
      context.fillStyle = box.edgeColor;
      context.fillRect(box.x, box.y, box.width, edgeTop);
      context.fillRect(box.x + box.width - edgeRight, box.y, edgeRight, box.height);
      context.fillRect(box.x, box.y + box.height - edgeBottom, box.width, edgeBottom);
      context.fillRect(box.x, box.y, edgeLeft, box.height);
    }
  }
  for (const { image, x, y, width: imageWidth, height: imageHeight } of shapes.images) {
    if (visible(y, imageHeight) && image.complete && image.naturalWidth) {
      context.drawImage(image, x, y, imageWidth, imageHeight);
    }
  }
  const { geometry, colors, colorIndex, tallest } = shapes.bars;
  context.globalAlpha = BAR_ALPHA;
  let color = -1;
  for (let index = firstBarFrom(geometry, top - tallest); index < colorIndex.length; index++) {
    const at = index * 4;
    const y = geometry[at + 1];
    if (y > bottom) {
      break;
    }
    if (colorIndex[index] !== color) {
      color = colorIndex[index];
      context.fillStyle = colors[color];
    }
    const barHeight = geometry[at + 3];
    context.fillRect(geometry[at], y + barHeight * BAR_INSET, geometry[at + 2], barHeight * (1 - 2 * BAR_INSET));
  }
  context.globalAlpha = 1;
  const least = MIN_MARK / scale;
  for (const mark of shapes.marks) {
    if (visible(mark.y, mark.height)) {
      context.fillStyle = mark.color;
      context.fillRect(mark.x, mark.y, Math.max(mark.width, least), Math.max(mark.height, least));
    }
  }
  context.restore();
}

type MutationSummary = Pick<MutationRecord, "type" | "target" | "addedNodes" | "removedNodes">;

const isMark = (node: Node) => node.nodeName === "MARK" && (node as Element).classList?.contains("find-match");
const isMarkOrText = (node: Node) => node.nodeType === 3 || isMark(node);

export function onlyFindMarks(records: MutationSummary[]) {
  return records.every((record) => {
    if (record.type === "attributes") {
      return isMark(record.target);
    }
    if (record.type === "childList") {
      return [...record.addedNodes, ...record.removedNodes].every(isMarkOrText);
    }
    return record.type === "characterData";
  });
}
