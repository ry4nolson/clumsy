import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { CalendarDays, Check, Dot, Hand, Highlighter, ImagePlus, MessageSquare, MousePointer2, PenLine, Plus, Signature, SquareCheck, Type, X } from "lucide-react";
import { inkColors, toolOptions } from "../hooks/useEditorOptions";
import { highlightColors, type EditorParams, type EditorTool } from "../hooks/usePdfViewer";
import { defaultContextTools, readContextTools, withContextTool, writeContextTools } from "../lib/contextTools";
import type { SignaturePreview } from "../lib/editorManagers";
import type { MarkKind } from "../lib/marks";
import { showContextMenu } from "../lib/platform";
import { IconButton } from "./IconButton";
import { SignaturePath } from "./SignatureDialog";
import { closeToolMenu, ToolMenu } from "./ToolMenu";

export type ToolsProps = {
  tool: EditorTool;
  mark: MarkKind | null;
  toolColor: string;
  editorParams: EditorParams;
  highlightsShown: boolean;
  signatures: SignaturePreview[];
  onTool: (tool: EditorTool) => void;
  onEndDrawing: () => void;
  onToolColor: (color: string) => void;
  onEditorParam: (type: number, value: number) => void;
  onToggleHighlights: () => void;
  onImage: () => void;
  onSign: () => void;
  onMark: (kind: MarkKind) => void;
  onNewSignature: () => void;
  onPlaceSignature: (uuid: string) => void;
  onForgetSignature: (uuid: string) => void;
};

type StyledTool = "highlight" | "text" | "draw";

const marks: Array<{ kind: MarkKind; label: string; icon: ReactNode }> = [
  { kind: "check", label: "Checkmark", icon: <Check size={16} /> },
  { kind: "cross", label: "Cross", icon: <X size={16} /> },
  { kind: "dot", label: "Dot", icon: <Dot size={16} strokeWidth={6} /> },
  { kind: "date", label: "Today's date", icon: <CalendarDays size={16} /> },
];

function toolMenu(tool: EditorTool) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const tools = readContextTools();
    const included = tools.includes(tool);
    showContextMenu([
      { label: included ? "Remove from Context Menu" : "Add to Context Menu", run: () => writeContextTools(withContextTool(readContextTools(), tool, !included)) },
      "-",
      { label: "Reset Context Menu Tools", enabled: tools.join() !== defaultContextTools.join(), run: () => writeContextTools(null) },
    ]);
  };
}

function ToolSettings({ props, tool }: { props: ToolsProps; tool: StyledTool }) {
  const inkTool = tool !== "highlight";
  const swatches = inkTool ? inkColors : Object.values(highlightColors);
  const toolColor = props.tool === tool ? props.toolColor : "";
  const hexColor = /^#[0-9a-f]{6}$/i.test(toolColor) ? toolColor.toLowerCase() : "";
  const otherColor = inkTool && hexColor !== "" && !swatches.some((color) => color.toLowerCase() === hexColor);
  return (
    <>
      <div className="swatches" role="radiogroup" aria-label="Color">
        {swatches.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={color.toLowerCase() === toolColor.toLowerCase()}
            aria-label={color}
            className="swatch"
            style={{ background: color }}
            onClick={() => props.onToolColor(color)}
          />
        ))}
        {inkTool && (
          <label
            className="swatch other-color"
            title="Other color…"
            data-chosen={otherColor || undefined}
            style={otherColor ? ({ "--chosen-color": hexColor } as CSSProperties) : undefined}
          >
            <input type="color" aria-label="Other color" value={hexColor || inkColors[0]} onChange={(event) => props.onToolColor(event.target.value)} />
          </label>
        )}
      </div>
      {toolOptions[tool]?.map((option) => {
        const value = Number(props.editorParams[option.type] ?? option.min);
        return (
          <label key={option.type} className="tool-option">
            <span className="tool-option-label">{option.label}</span>
            <span className="tool-option-value">{option.format(value)}</span>
            <input
              type="range"
              min={option.min}
              max={option.max}
              step={option.step}
              value={value}
              onChange={(event) => props.onEditorParam(option.type, Number(event.target.value))}
            />
          </label>
        );
      })}
      {tool === "highlight" && (
        <label className="tool-menu-check">
          <input type="checkbox" checked={props.highlightsShown} onChange={props.onToggleHighlights} />
          Show highlights
        </label>
      )}
    </>
  );
}

function StyledToolButton({ props, tool, title, label, icon }: { props: ToolsProps; tool: StyledTool; title: string; label: string; icon: ReactNode }) {
  const active = props.tool === tool;
  return (
    <ToolMenu
      label={label}
      active={active}
      button={
        <IconButton title={title} active={active} onContextMenu={toolMenu(tool)} onClick={() => props.onTool(tool)}>
          {icon}
        </IconButton>
      }
      onOpen={() => !active && props.onTool(tool)}
    >
      <ToolSettings props={props} tool={tool} />
    </ToolMenu>
  );
}

export type ToolEntry = { key: EditorTool; node: ReactNode };

export function toolEntries(props: ToolsProps): ToolEntry[] {
  const { tool } = props;
  return [
    {
      key: "select",
      node: (
        <IconButton title="Select (V)" active={tool === "select"} onContextMenu={toolMenu("select")} onClick={() => props.onTool("select")}>
          <MousePointer2 size={18} />
        </IconButton>
      ),
    },
    {
      key: "hand",
      node: (
        <IconButton title="Hand (hold Space)" active={tool === "hand"} onContextMenu={toolMenu("hand")} onClick={() => props.onTool("hand")}>
          <Hand size={18} />
        </IconButton>
      ),
    },
    { key: "highlight", node: <StyledToolButton props={props} tool="highlight" title="Highlight (H)" label="Highlight options" icon={<Highlighter size={18} />} /> },
    { key: "text", node: <StyledToolButton props={props} tool="text" title="Text note (T)" label="Text options" icon={<Type size={18} />} /> },
    { key: "draw", node: <StyledToolButton props={props} tool="draw" title="Draw (D)" label="Draw options" icon={<PenLine size={18} />} /> },
    {
      key: "comment",
      node: (
        <IconButton title="Comments (C)" active={tool === "comment"} onContextMenu={toolMenu("comment")} onClick={() => props.onTool("comment")}>
          <MessageSquare size={18} />
        </IconButton>
      ),
    },
    {
      key: "image",
      node: (
        <IconButton title="Add image" active={tool === "image"} onContextMenu={toolMenu("image")} onClick={props.onImage}>
          <ImagePlus size={18} />
        </IconButton>
      ),
    },
    { key: "signature", node: <SignatureTool props={props} /> },
    { key: "mark", node: <MarkTool props={props} /> },
  ];
}

function SignatureTool({ props }: { props: ToolsProps }) {
  const active = props.tool === "signature";
  return (
    <ToolMenu
      label="Signatures"
      active={active}
      keepOpenWhenInactive
      button={
        <IconButton title="Sign" active={active} onContextMenu={toolMenu("signature")} onClick={props.onSign}>
          <Signature size={18} />
        </IconButton>
      }
    >
      {props.signatures.length > 0 && (
        <div className="signature-chips">
          {props.signatures.map((signature) => (
            <div key={signature.uuid} className="signature-chip">
              <button
                type="button"
                title={`Place “${signature.description || "Signature"}”`}
                onClick={(event) => {
                  closeToolMenu(event.currentTarget);
                  props.onPlaceSignature(signature.uuid);
                }}
              >
                <SignaturePath preview={signature} />
              </button>
              <button type="button" className="forget" title="Remove saved signature" aria-label="Remove saved signature" onClick={() => props.onForgetSignature(signature.uuid)}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="tool-menu-item"
        onClick={(event) => {
          closeToolMenu(event.currentTarget);
          props.onNewSignature();
        }}
      >
        <Plus size={16} />
        New Signature…
      </button>
    </ToolMenu>
  );
}

function MarkTool({ props }: { props: ToolsProps }) {
  const active = props.tool === "mark";
  return (
    <ToolMenu
      label="Fill-in marks"
      active={active}
      keepOpenWhenInactive
      button={
        <IconButton title="Fill in: click to place a checkmark, cross, dot, or date" active={active} onContextMenu={toolMenu("mark")} onClick={() => props.onMark(props.mark ?? "check")}>
          <SquareCheck size={18} />
        </IconButton>
      }
    >
      {marks.map(({ kind, label, icon }) => (
        <button
          key={kind}
          type="button"
          className="tool-menu-item"
          aria-pressed={active && props.mark === kind}
          onClick={(event) => {
            closeToolMenu(event.currentTarget);
            props.onMark(kind);
          }}
        >
          {icon}
          {label}
        </button>
      ))}
    </ToolMenu>
  );
}
