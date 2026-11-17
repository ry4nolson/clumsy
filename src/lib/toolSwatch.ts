import { colorFromHex, newMarkup, type Markup } from "./markup";
import { defaultFormat, fullSize } from "./measure";
import { markupDrawing, matrixAttribute, svg } from "./markupSvg";
import { stampAspect } from "./stampSymbols";
import { fixedColor, parseToolRef, type SavedTool } from "./toolChest";

export const SWATCH_WIDTH = 36;
export const SWATCH_HEIGHT = 24;
const MAX_STROKE = 3.5;

function stampBox(stamp: string) {
  const aspect = stampAspect(stamp);
  const [maxWidth, maxHeight] = [SWATCH_WIDTH - 4, SWATCH_HEIGHT - 4];
  const height = Math.min(maxHeight, maxWidth / aspect);
  const width = height * aspect;
  const [x, y] = [(SWATCH_WIDTH - width) / 2, (SWATCH_HEIGHT - height) / 2];
  return [x, y, x + width, y + height];
}

export function swatchMarkup(tool: SavedTool): Markup | null {
  const target = parseToolRef(tool.tool);
  if (!target || target.kind === "editor") {
    return null;
  }
  const style = { color: colorFromHex(tool.style.color), fill: tool.style.fill, width: Math.min(tool.style.width, MAX_STROKE), opacity: tool.style.opacity };
  const base = { id: "swatch", pageIndex: 0, dash: tool.style.dash };
  const date = "";
  switch (target.kind) {
    case "shape": {
      const line = target.shape === "line" || target.shape === "arrow" ? [6, 5, 30, 19] : null;
      return newMarkup({ ...base, kind: target.shape, box: line ?? [5, 5, 31, 19], line }, style, date);
    }
    case "stamp":
      return newMarkup({ ...base, kind: "stamp", box: stampBox(target.stamp), stamp: target.stamp, width: 0, dash: null, color: fixedColor(target) ?? style.color }, style, date);
    case "text":
      return newMarkup({ ...base, kind: target.text, box: [4, 7, 32, 17], quads: [4, 17, 32, 17, 4, 7, 32, 7], dash: null }, style, date);
    default: {
      const measure = { scale: fullSize, format: tool.measure ?? defaultFormat };
      if (target.measure === "measure-length") {
        return newMarkup({ ...base, kind: target.measure, box: [4, 12, 32, 12], line: [4, 12, 32, 12], measure }, style, date);
      }
      const vertices = target.measure === "measure-area" ? [5, 5, 31, 7, 27, 19, 8, 17] : [4, 6, 13, 18, 22, 8, 32, 18];
      return newMarkup({ ...base, kind: target.measure, box: [4, 5, 32, 19], vertices, measure }, style, date);
    }
  }
}

function editorSwatch(tool: SavedTool, editor: "highlight" | "draw" | "text") {
  const color = tool.style.color;
  if (editor === "highlight") {
    return svg("rect", { x: 3, y: 7, width: 30, height: 10, rx: 1.5, fill: color });
  }
  if (editor === "draw") {
    return svg("path", { d: "M 4 15 C 9 4, 13 4, 16 12 S 24 21, 32 9", fill: "none", stroke: color, "stroke-width": Math.min(tool.style.width, MAX_STROKE), "stroke-linecap": "round", "stroke-opacity": tool.style.opacity });
  }
  const text = svg("text", { x: SWATCH_WIDTH / 2, y: 18, "text-anchor": "middle", "font-size": 16, "font-weight": 600, fill: color });
  text.textContent = "Aa";
  return text;
}

export function swatchSvg(tool: SavedTool) {
  const root = svg("svg", { class: "tool-swatch", viewBox: `0 0 ${SWATCH_WIDTH} ${SWATCH_HEIGHT}`, width: SWATCH_WIDTH, height: SWATCH_HEIGHT, "aria-hidden": "true" });
  const target = parseToolRef(tool.tool);
  if (target?.kind === "editor") {
    root.append(editorSwatch(tool, target.editor));
    return root;
  }
  const markup = swatchMarkup(tool);
  if (markup) {
    const drawing = markupDrawing(markup);
    drawing.querySelector(":scope > text")?.remove();
    const flipped = svg("g", { transform: matrixAttribute([1, 0, 0, -1, 0, SWATCH_HEIGHT]) });
    flipped.append(drawing);
    root.append(flipped);
  }
  return root;
}
