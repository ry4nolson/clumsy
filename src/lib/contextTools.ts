import type { EditorTool } from "../hooks/useViewerTools";
import type { CommandId } from "./commands";
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
];

export const markCommands: Record<MarkKind, CommandId> = { check: "markCheck", cross: "markCross", dot: "markDot", date: "markDate" };

export const toolCommand = (tool: EditorTool, mark: MarkKind | null = null) =>
  tool === "mark" ? markCommands[mark ?? "check"] : (toolbarTools.find((info) => info.tool === tool)?.command ?? "toolSelect");

export const defaultContextTools: EditorTool[] = ["select", "highlight", "text", "draw", "comment", "signature"];

export function cleanContextTools(value: unknown): EditorTool[] {
  if (!Array.isArray(value)) {
    return defaultContextTools;
  }
  const chosen = new Set(value);
  return toolbarTools.filter((info) => chosen.has(info.tool)).map((info) => info.tool);
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

export const withContextTool = (tools: EditorTool[], tool: EditorTool, included: boolean) =>
  cleanContextTools(included ? [...tools, tool] : tools.filter((candidate) => candidate !== tool));

type ToolStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readContextTools(storage?: ToolStorage) {
  try {
    return parseContextTools((storage ?? localStorage).getItem(CONTEXT_TOOLS_KEY));
  } catch {
    return defaultContextTools;
  }
}

export function writeContextTools(tools: EditorTool[] | null, storage?: ToolStorage) {
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
