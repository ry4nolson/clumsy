import { colorFromHex, hexColor, isMeasureKind, isTextKind, kindLabels, shapeKinds, type Markup, type MarkupPreset, type ShapeKind, type TextMarkupKind } from "./markup";
import { decimalPrecisions, fractionPrecisions, isFractional, lengthUnits, type LengthUnit, type MeasureFormat, type MeasureKind } from "./measure";
import { isCustomStampId } from "./customStamps";
import { isKnownStamp, stampColor, stampLabel } from "./stampSymbols";

export const TOOL_CHEST_KEY = "clumsy.toolChest";
export const TOOL_CHEST_EXTENSION = "clumsytools";
export const TOOL_CHEST_VERSION = 1;
export const MAX_SAVED_TOOLS = 500;
const MAX_NAME = 80;

export type EditorKind = "highlight" | "draw" | "text";
export type ToolTarget =
  | { kind: "shape"; shape: ShapeKind }
  | { kind: "stamp"; stamp: string }
  | { kind: "text"; text: TextMarkupKind }
  | { kind: "measure"; measure: MeasureKind }
  | { kind: "editor"; editor: EditorKind };

export type ToolStyle = { color: string; fill: boolean; width: number; opacity: number; dash: number[] | null };

export type SavedTool = { id: string; name: string; group: string | null; tool: string; style: ToolStyle; measure?: MeasureFormat };

export type ToolChest = { version: number; tools: SavedTool[] };

const measureNames: Record<MeasureKind, string> = { "measure-length": "length", "measure-path": "path", "measure-area": "area" };
const editorKinds: EditorKind[] = ["highlight", "draw", "text"];
const editorLabels: Record<EditorKind, string> = { highlight: "Highlight", draw: "Draw", text: "Text Note" };

export function toolRef(target: ToolTarget): string {
  switch (target.kind) {
    case "shape":
      return `shape:${target.shape}`;
    case "stamp":
      return `stamp:${target.stamp}`;
    case "text":
      return `text:${target.text}`;
    case "measure":
      return `measure:${measureNames[target.measure]}`;
    default:
      return target.editor;
  }
}

export function parseToolRef(ref: unknown): ToolTarget | null {
  if (typeof ref !== "string") {
    return null;
  }
  if (editorKinds.includes(ref as EditorKind)) {
    return { kind: "editor", editor: ref as EditorKind };
  }
  const [kind, value] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  if (kind === "shape" && shapeKinds.includes(value as ShapeKind)) {
    return { kind, shape: value as ShapeKind };
  }
  if (kind === "stamp" && (isKnownStamp(value) || isCustomStampId(value))) {
    return { kind, stamp: value };
  }
  if (kind === "text" && (value === "underline" || value === "strikeout")) {
    return { kind, text: value };
  }
  const measure = (Object.keys(measureNames) as MeasureKind[]).find((candidate) => measureNames[candidate] === value);
  return kind === "measure" && measure ? { kind, measure } : null;
}

type Range = { min: number; max: number };

export function widthRange(target: ToolTarget): Range | null {
  if (target.kind === "stamp" || target.kind === "text") {
    return null;
  }
  if (target.kind === "editor") {
    return target.editor === "highlight" ? { min: 8, max: 24 } : target.editor === "text" ? { min: 5, max: 100 } : { min: 1, max: 20 };
  }
  return { min: 0.5, max: 12 };
}

export const canFill = (target: ToolTarget) =>
  (target.kind === "shape" && (target.shape === "rectangle" || target.shape === "ellipse" || target.shape === "cloud")) || (target.kind === "measure" && target.measure === "measure-area");

export const hasOpacity = (target: ToolTarget) => target.kind !== "editor" || target.editor === "draw";

export const canDash = (target: ToolTarget) => target.kind === "shape" || target.kind === "measure";

export const fixedColor = (target: ToolTarget) => (target.kind === "stamp" ? stampColor(target.stamp) : null);

export const DASH: number[] = [4, 3];

const clamp = (value: unknown, min: number, max: number, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

const cleanText = (value: unknown, max = MAX_NAME) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

function cleanDash(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 8) {
    return null;
  }
  const numbers = value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry) && entry > 0 && entry <= 100);
  return numbers.length === value.length ? numbers : null;
}

export function defaultWidth(target: ToolTarget) {
  if (target.kind === "editor") {
    return target.editor === "highlight" ? 12 : target.editor === "text" ? 10 : 1;
  }
  return target.kind === "stamp" ? 0 : 2;
}

export function cleanStyle(value: unknown, target: ToolTarget): ToolStyle {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof ToolStyle, unknown>>;
  const range = widthRange(target);
  const minOpacity = target.kind === "editor" ? 0.05 : 0.1;
  return {
    color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : "#e5484d",
    fill: canFill(target) && raw.fill === true,
    width: range ? clamp(raw.width, range.min, range.max, defaultWidth(target)) : 0,
    opacity: hasOpacity(target) ? clamp(raw.opacity, minOpacity, 1, 1) : 1,
    dash: canDash(target) ? cleanDash(raw.dash) : null,
  };
}

export function cleanFormat(value: unknown): MeasureFormat {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof MeasureFormat, unknown>>;
  const unit = lengthUnits.includes(raw.unit as LengthUnit) ? (raw.unit as LengthUnit) : "ft-in";
  const options: number[] = isFractional(unit) ? fractionPrecisions : decimalPrecisions;
  return { unit, precision: options.includes(raw.precision as number) ? (raw.precision as number) : isFractional(unit) ? 16 : 2 };
}

export function cleanTool(value: unknown): SavedTool | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const target = parseToolRef(raw.tool);
  const id = cleanText(raw.id, 100);
  const name = cleanText(raw.name);
  if (!target || !id || !name) {
    return null;
  }
  const group = cleanText(raw.group) || null;
  const tool: SavedTool = { id, name, group, tool: toolRef(target), style: cleanStyle(raw.style, target) };
  return target.kind === "measure" && raw.measure ? { ...tool, measure: cleanFormat(raw.measure) } : tool;
}

export function cleanToolChest(value: unknown): ToolChest {
  const list = value && typeof value === "object" && Array.isArray((value as ToolChest).tools) ? (value as ToolChest).tools : [];
  const seen = new Set<string>();
  const tools: SavedTool[] = [];
  for (const entry of list) {
    const tool = cleanTool(entry);
    if (tool && !seen.has(tool.id) && tools.length < MAX_SAVED_TOOLS) {
      seen.add(tool.id);
      tools.push(tool);
    }
  }
  return { version: TOOL_CHEST_VERSION, tools };
}

const style = (color: string, extra: Partial<ToolStyle> = {}): ToolStyle => ({ color, fill: false, width: 2, opacity: 1, dash: null, ...extra });
const feetAndInches: MeasureFormat = { unit: "ft-in", precision: 16 };

export const starterTools: SavedTool[] = [
  { id: "starter-approved", name: "Approved", group: "Review", tool: "stamp:review:approved", style: style("#228c40", { width: 0 }) },
  { id: "starter-rejected", name: "Rejected", group: "Review", tool: "stamp:review:rejected", style: style("#cc2126", { width: 0 }) },
  { id: "starter-for-review", name: "For Review", group: "Review", tool: "stamp:review:for-review", style: style("#1f61bf", { width: 0 }) },
  { id: "starter-revision", name: "Revision cloud", group: "Review", tool: "shape:cloud", style: style("#e5484d") },
  { id: "starter-highlight", name: "Highlight", group: "Review", tool: "highlight", style: style("#ffff98", { width: 12 }) },
  { id: "starter-length", name: "Length", group: "Measure", tool: "measure:length", style: style("#e5484d"), measure: feetAndInches },
  { id: "starter-area", name: "Area", group: "Measure", tool: "measure:area", style: style("#1565c0", { fill: true }), measure: feetAndInches },
];

export const starterChest = (): ToolChest => ({ version: TOOL_CHEST_VERSION, tools: starterTools.map((tool) => ({ ...tool, style: { ...tool.style } })) });

type Store = Pick<Storage, "getItem" | "setItem">;

export function parseToolChest(text: string | null): ToolChest {
  if (text === null) {
    return starterChest();
  }
  try {
    return cleanToolChest(JSON.parse(text));
  } catch {
    return { version: TOOL_CHEST_VERSION, tools: [] };
  }
}

export function readToolChest(store?: Store): ToolChest {
  try {
    return parseToolChest((store ?? localStorage).getItem(TOOL_CHEST_KEY));
  } catch {
    return starterChest();
  }
}

export function writeToolChest(chest: ToolChest, store?: Store) {
  try {
    (store ?? localStorage).setItem(TOOL_CHEST_KEY, JSON.stringify(cleanToolChest(chest)));
    return true;
  } catch {
    return false;
  }
}

export function toolLabel(target: ToolTarget) {
  switch (target.kind) {
    case "shape":
      return kindLabels[target.shape];
    case "stamp":
      return stampLabel(target.stamp);
    case "text":
      return kindLabels[target.text];
    case "measure":
      return kindLabels[target.measure];
    default:
      return editorLabels[target.editor];
  }
}

export function toolSymbol(target: ToolTarget) {
  switch (target.kind) {
    case "shape":
      return "square.on.circle";
    case "stamp":
      return "seal";
    case "measure":
      return "ruler";
    case "text":
      return "highlighter";
    default:
      return target.editor === "draw" ? "pencil.tip" : target.editor === "text" ? "character.textbox" : "highlighter";
  }
}

export function targetOfMarkup(markup: Pick<Markup, "kind" | "stamp">): ToolTarget | null {
  if (markup.kind === "stamp") {
    return markup.stamp && isKnownStamp(markup.stamp) ? { kind: "stamp", stamp: markup.stamp } : null;
  }
  if (isTextKind(markup.kind)) {
    return { kind: "text", text: markup.kind };
  }
  if (isMeasureKind(markup.kind)) {
    return { kind: "measure", measure: markup.kind };
  }
  return { kind: "shape", shape: markup.kind };
}

export function toolOfMarkup(markup: Markup, id: string): SavedTool | null {
  const target = targetOfMarkup(markup);
  if (!target) {
    return null;
  }
  const name = cleanText(markup.subject) || toolLabel(target);
  const saved = { id, name, group: null, tool: toolRef(target), style: { color: hexColor(markup.color), fill: markup.fill !== null, width: markup.width, opacity: markup.opacity, dash: markup.dash }, measure: markup.measure?.format };
  return cleanTool(saved);
}

export function newTool(id: string, target: ToolTarget, fields: { name: string; group?: string | null; style: Partial<ToolStyle>; measure?: MeasureFormat }): SavedTool | null {
  return cleanTool({ id, name: fields.name, group: fields.group ?? null, tool: toolRef(target), style: { ...style("#e5484d", { width: defaultWidth(target) }), ...fields.style }, measure: fields.measure });
}

export function markupPreset(tool: SavedTool): MarkupPreset {
  return {
    id: tool.id,
    name: tool.name,
    style: { color: colorFromHex(tool.style.color), fill: tool.style.fill, width: tool.style.width, opacity: tool.style.opacity },
    dash: tool.style.dash,
    format: tool.measure ?? null,
  };
}

export type ArmSpec =
  | { kind: "markup"; target: Exclude<ToolTarget, { kind: "editor" }>; preset: MarkupPreset }
  | { kind: "editor"; editor: EditorKind; color: string; width: number; opacity: number };

export function armSpec(tool: SavedTool): ArmSpec | null {
  const target = parseToolRef(tool.tool);
  if (!target) {
    return null;
  }
  if (target.kind === "editor") {
    return { kind: "editor", editor: target.editor, color: tool.style.color, width: tool.style.width, opacity: tool.style.opacity };
  }
  return { kind: "markup", target, preset: markupPreset(tool) };
}
