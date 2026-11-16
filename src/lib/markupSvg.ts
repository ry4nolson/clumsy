import { customStamp, imageHref } from "./customStamps";
import { hexColor, isLineKind, isMeasureKind, isTextKind, isVertexKind, type Markup } from "./markup";
import { CAPTION_SIZE, captionBaseline, captionPlacement, captionText, vertexPath } from "./measureMarkup";
import { handlePoints, isCorner, lineEndings, outerRect, outlinePath, rectPath, segmentsPath, stampMatrix, textMarkupSegments } from "./markupShapes";
import { CAP_HEIGHT, stampDesign, type StampDesign } from "./stampSymbols";

export const SVG = "http://www.w3.org/2000/svg";
export const LABEL_FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number | null | undefined> = {}) {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) {
      element.setAttribute(name, String(value));
    }
  }
  return element;
}

export const matrixAttribute = (matrix: number[]) => `matrix(${matrix.join(" ")})`;

export function designElements(design: StampDesign, color: string, opacity = 1) {
  if (design.image) {
    return [svg("image", { href: imageHref(design.image), x: 0, y: 0, width: design.width, height: design.height, preserveAspectRatio: "none", opacity })];
  }
  const shapes = design.shapes.map((shape) =>
    svg("path", {
      d: shape.d,
      fill: shape.fill ? color : "none",
      stroke: shape.fill ? "none" : color,
      "stroke-width": shape.fill ? null : (shape.strokeWidth ?? design.strokeWidth),
    }),
  );
  const labels = design.labels.map((label) => {
    const text = svg("text", {
      x: label.x,
      y: label.y + (label.size * CAP_HEIGHT) / 2,
      "font-size": label.size,
      "font-family": LABEL_FONT,
      "font-weight": 700,
      "text-anchor": "middle",
      fill: color,
      stroke: "none",
    });
    text.textContent = label.text;
    return text;
  });
  return [...shapes, ...labels];
}

function captionElement(markup: Markup, color: string) {
  const placement = captionPlacement(markup);
  const [cos, sin] = [Math.cos(placement.angle), Math.sin(placement.angle)];
  const text = svg("text", {
    transform: matrixAttribute([cos, sin, sin, -cos, placement.x, placement.y]),
    y: -captionBaseline(placement),
    "font-size": CAPTION_SIZE,
    "font-family": LABEL_FONT,
    "text-anchor": "middle",
    fill: color,
    stroke: "none",
  });
  text.textContent = captionText(markup);
  return text;
}

export const isImageStamp = (markup: Markup) => markup.kind === "stamp" && !!markup.stamp && customStamp(markup.stamp)?.kind === "image";

export function markupDrawing(markup: Markup) {
  const color = hexColor(markup.color);
  const group = svg("g", { "stroke-opacity": markup.opacity, "fill-opacity": markup.opacity, "stroke-linecap": "round", "stroke-linejoin": "round" });
  const stroke = { stroke: color, "stroke-width": markup.width, "stroke-dasharray": markup.dash?.join(" ") || null, fill: "none" };
  if (isTextKind(markup.kind)) {
    group.append(svg("path", { d: segmentsPath(textMarkupSegments(markup.kind, markup.quads ?? [], markup.width)), ...stroke, "stroke-linecap": "butt" }));
  } else if (isLineKind(markup.kind)) {
    const [x1, y1, x2, y2] = markup.line ?? markup.box;
    group.append(svg("path", { d: `M ${x1} ${y1} L ${x2} ${y2}`, ...stroke }));
    for (const ending of lineEndings(markup)) {
      group.append(svg("path", { d: ending.d, ...stroke, fill: ending.closed ? hexColor(markup.fill ?? markup.color) : "none" }));
    }
  } else if (isVertexKind(markup.kind)) {
    const d = vertexPath(markup.vertices ?? [], markup.kind === "measure-area");
    if (markup.fill) {
      group.append(svg("path", { d, fill: hexColor(markup.fill), "fill-opacity": markup.opacity * markup.fillAlpha, stroke: "none" }));
    }
    group.append(svg("path", { d, ...stroke }));
  } else if (markup.kind === "stamp") {
    const design = markup.stamp ? stampDesign(markup.stamp, markup.stampDate) : null;
    if (design) {
      const inner = svg("g", { transform: matrixAttribute(stampMatrix(markup.box, markup.rotation, design.width, design.height)) });
      inner.append(...designElements(design, color, markup.opacity));
      group.append(inner);
    }
  } else {
    const d = outlinePath(markup.kind, markup.box);
    if (markup.fill) {
      group.append(svg("path", { d, fill: hexColor(markup.fill), "fill-opacity": markup.opacity * markup.fillAlpha, stroke: "none" }));
    }
    if (markup.width > 0) {
      group.append(svg("path", { d, ...stroke }));
    }
  }
  if (isMeasureKind(markup.kind)) {
    group.append(captionElement(markup, color));
  }
  return group;
}

export function markupHitTarget(markup: Markup, minWidth: number) {
  const width = Math.max(markup.width, minWidth);
  if (markup.kind === "stamp") {
    return svg("path", { d: rectPath(markup.box), class: "markup-hit filled" });
  }
  if (isTextKind(markup.kind)) {
    return svg("path", { d: segmentsPath(textMarkupSegments(markup.kind, markup.quads ?? [], markup.width)), class: "markup-hit", "stroke-width": width });
  }
  if (isLineKind(markup.kind)) {
    const [x1, y1, x2, y2] = markup.line ?? markup.box;
    return svg("path", { d: `M ${x1} ${y1} L ${x2} ${y2}`, class: "markup-hit", "stroke-width": width });
  }
  if (isVertexKind(markup.kind)) {
    const d = vertexPath(markup.vertices ?? [], markup.kind === "measure-area");
    return svg("path", { d, class: markup.fill ? "markup-hit filled" : "markup-hit", "stroke-width": width });
  }
  return svg("path", { d: outlinePath(markup.kind, markup.box), class: markup.fill ? "markup-hit filled" : "markup-hit", "stroke-width": width });
}

const HANDLE_SIZE = 8;

type ScreenViewport = { convertToViewportPoint(x: number, y: number): number[] };

export function selectionOverlay(markup: Markup, viewport: ScreenViewport) {
  const group = svg("g", { class: "markup-selection" });
  const [left, bottom, right, top] = outerRect(markup);
  const corners = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ].map(([x, y]) => viewport.convertToViewportPoint(x, y));
  group.append(svg("path", { class: "markup-outline", d: `${corners.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ")} Z` }));
  const [cx, cy] = viewport.convertToViewportPoint((left + right) / 2, (bottom + top) / 2);
  for (const [handle, [x, y]] of handlePoints(markup)) {
    const [hx, hy] = viewport.convertToViewportPoint(x, y);
    const cursor = !isCorner(handle) ? null : (hx - cx) * (hy - cy) > 0 ? "nwse" : "nesw";
    group.append(svg("rect", { class: "markup-handle", "data-handle": handle, "data-cursor": cursor, x: hx - HANDLE_SIZE / 2, y: hy - HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE, rx: 1.5 }));
  }
  return group;
}
