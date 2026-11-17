import type { EditorTool } from "../hooks/useViewerTools";
import type { CommandId } from "./commands";
import type { ShapeKind } from "./markup";
import type { MeasureKind } from "./measure";
import type { MarkKind } from "./marks";

export const CONTEXT_TOOLS_KEY = "clumsy.contextTools";

export type ToolInfo = { tool: EditorTool; label: string; symbol: string; command: CommandId };

export const toolbarTools: ToolInfo[] = [
  { tool: "select", label: "Select", symbol: "cursorarrow", command: "toolSelect" },
  { tool: "hand", label: "Hand", symbol: "hand.raised", command: "toolHand" },
  { tool: "highlight", label: "Highlight", symbol: "highlighter", command: "toolHighlight" },
  { tool: "text", label: "Text Note", symbol: "character.textbox", command: "toolText" },
  { tool: "draw", label: "Draw", symbol: "pencil.tip", command: "toolDraw" },
  { tool: "comment", label: "Comments", symbol: "text.bubble", command: "toolComment" },
  { tool: "image", label: "Add Image", symbol: "photo.badge.plus", command: "addImage" },
  { tool: "signature", label: "Sign", symbol: "signature", command: "sign" },
  { tool: "mark", label: "Fill In", symbol: "checkmark.square", command: "markCheck" },
  { tool: "shape", label: "Shapes", symbol: "square.on.circle", command: "shapeRectangle" },
  { tool: "stamp", label: "Stamps", symbol: "seal", command: "toolStamp" },
  { tool: "measure", label: "Measure", symbol: "ruler", command: "measureLength" },
];

export const markCommands: Record<MarkKind, CommandId> = { check: "markCheck", cross: "markCross", dot: "markDot", date: "markDate" };

export const shapeCommands: Record<ShapeKind, CommandId> = { rectangle: "shapeRectangle", ellipse: "shapeEllipse", cloud: "shapeCloud", line: "shapeLine", arrow: "shapeArrow" };

export const measureCommands: Record<MeasureKind, CommandId> = { "measure-length": "measureLength", "measure-path": "measurePath", "measure-area": "measureArea" };

const textToolCommands: Partial<Record<EditorTool, CommandId>> = { underline: "toolUnderline", strikeout: "toolStrikeout" };

export function toolCommand(tool: EditorTool, mark: MarkKind | null = null, shape: ShapeKind = "rectangle", measure: MeasureKind = "measure-length"): CommandId {
  if (tool === "mark") {
    return markCommands[mark ?? "check"];
  }
  if (tool === "shape") {
    return shapeCommands[shape];
  }
  if (tool === "measure") {
    return measureCommands[measure];
  }
  return textToolCommands[tool] ?? toolbarTools.find((info) => info.tool === tool)?.command ?? "toolSelect";
}

export const SAVED_PREFIX = "saved:";

export type SavedToolEntry = `saved:${string}`;
export type ContextTool = EditorTool | SavedToolEntry;

export const savedEntry = (id: string): SavedToolEntry => `${SAVED_PREFIX}${id}`;
export const savedIdOf = (entry: string) => (entry.startsWith(SAVED_PREFIX) ? entry.slice(SAVED_PREFIX.length) : null);

export const defaultContextTools: ContextTool[] = ["select", "highlight", "text", "draw", "comment", "signature"];

export function cleanContextTools(value: unknown): ContextTool[] {
  if (!Array.isArray(value)) {
    return defaultContextTools;
  }
  const chosen = new Set(value);
  const saved = value.filter((entry): entry is SavedToolEntry => typeof entry === "string" && entry.length > SAVED_PREFIX.length && entry.length <= 120 && entry.startsWith(SAVED_PREFIX));
  return [...toolbarTools.filter((info) => chosen.has(info.tool)).map((info) => info.tool), ...new Set(saved)];
}

export function parseContextTools(stored: string | null) {
  if (stored === null) {
    return defaultContextTools;
  }
  try {
    return cleanContextTools(JSON.parse(stored));
  } catch {
    return defaultContextTools;
  }
}

export const withContextTool = (tools: ContextTool[], tool: ContextTool, included: boolean) =>
  cleanContextTools(included ? [...tools, tool] : tools.filter((candidate) => candidate !== tool));

type ToolStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readContextTools(storage?: ToolStorage) {
  try {
    return parseContextTools((storage ?? localStorage).getItem(CONTEXT_TOOLS_KEY));
  } catch {
    return defaultContextTools;
  }
}

export function writeContextTools(tools: ContextTool[] | null, storage?: ToolStorage) {
  try {
    if (tools) {
      (storage ?? localStorage).setItem(CONTEXT_TOOLS_KEY, JSON.stringify(tools));
    } else {
      (storage ?? localStorage).removeItem(CONTEXT_TOOLS_KEY);
    }
  } catch {
    return;
  }
}

export function forgetSavedContextTools(ids: string[], storage?: ToolStorage) {
  const tools = readContextTools(storage);
  const kept = tools.filter((tool) => !ids.includes(savedIdOf(tool) ?? ""));
  if (kept.length !== tools.length) {
    writeContextTools(kept, storage);
  }
}
