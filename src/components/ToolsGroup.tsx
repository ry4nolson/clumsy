import type { ReactNode } from "react";
import { CalendarDays, Check, Dot, Eye, EyeOff, Hand, Highlighter, ImagePlus, MessageSquare, MousePointer2, PenLine, Plus, Signature, SquareCheck, Type, X } from "lucide-react";
import { inkColors, toolOptions } from "../hooks/useEditorOptions";
import { highlightColors, type EditorParams, type EditorTool } from "../hooks/usePdfViewer";
import type { SignaturePreview } from "../lib/editorManagers";
import type { MarkKind } from "../lib/marks";
import { IconButton } from "./IconButton";
import { SignaturePath } from "./SignatureDialog";

export type ToolsProps = {
  tool: EditorTool;
  mark: MarkKind | null;
  toolColor: string;
  editorParams: EditorParams;
  highlightsShown: boolean;
  signatures: SignaturePreview[];
  onTool: (tool: EditorTool) => void;
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

const marks: Array<{ kind: MarkKind; label: string; icon: ReactNode }> = [
  { kind: "check", label: "Checkmark", icon: <Check size={16} /> },
  { kind: "cross", label: "Cross", icon: <X size={16} /> },
  { kind: "dot", label: "Dot", icon: <Dot size={16} strokeWidth={6} /> },
  { kind: "date", label: "Today's date", icon: <CalendarDays size={16} /> },
];

export function ToolsGroup(props: ToolsProps) {
  const { tool, toolColor } = props;
  const swatches = tool === "highlight" ? Object.values(highlightColors) : tool === "text" || tool === "draw" ? inkColors : [];
  return (
    <div className="toolbar-group tools" data-tauri-drag-region>
      <IconButton title="Select (V)" active={tool === "select"} onClick={() => props.onTool("select")}>
        <MousePointer2 size={18} />
      </IconButton>
      <IconButton title="Hand (hold Space)" active={tool === "hand"} onClick={() => props.onTool("hand")}>
        <Hand size={18} />
      </IconButton>
      <IconButton title="Highlight (H)" active={tool === "highlight"} onClick={() => props.onTool("highlight")}>
        <Highlighter size={18} />
      </IconButton>
      <IconButton title="Text note (T)" active={tool === "text"} onClick={() => props.onTool("text")}>
        <Type size={18} />
      </IconButton>
      <IconButton title="Draw (D)" active={tool === "draw"} onClick={() => props.onTool("draw")}>
        <PenLine size={18} />
      </IconButton>
      <IconButton title="Comments (C)" active={tool === "comment"} onClick={() => props.onTool("comment")}>
        <MessageSquare size={18} />
      </IconButton>
      <IconButton title="Add image" active={tool === "image"} onClick={props.onImage}>
        <ImagePlus size={18} />
      </IconButton>
      <IconButton title="Sign" active={tool === "signature"} onClick={props.onSign}>
        <Signature size={18} />
      </IconButton>
      <IconButton title="Fill in: click to place a checkmark, cross, dot, or date" active={tool === "mark"} onClick={() => props.onMark(props.mark ?? "check")}>
        <SquareCheck size={18} />
      </IconButton>
      {swatches.length > 0 && (
        <div className="swatches" role="radiogroup" aria-label="Color" data-tauri-drag-region>
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
        </div>
      )}
      {toolOptions[tool]?.map((option) => {
        const value = Number(props.editorParams[option.type] ?? option.min);
        return (
          <label key={option.type} className="tool-option" title={`${option.label}: ${option.format(value)}`} data-tauri-drag-region>
            <input
              type="range"
              aria-label={option.label}
              min={option.min}
              max={option.max}
              step={option.step}
              value={value}
              onChange={(event) => props.onEditorParam(option.type, Number(event.target.value))}
            />
            <span className="tool-option-value" aria-hidden="true">
              {option.format(value)}
            </span>
          </label>
        );
      })}
      {tool === "highlight" && (
        <IconButton title={props.highlightsShown ? "Hide highlights" : "Show highlights"} active={!props.highlightsShown} onClick={props.onToggleHighlights}>
          {props.highlightsShown ? <Eye size={16} /> : <EyeOff size={16} />}
        </IconButton>
      )}
      {tool === "mark" && (
        <div className="mark-choices" data-tauri-drag-region>
          {marks.map(({ kind, label, icon }) => (
            <IconButton key={kind} title={label} active={props.mark === kind} onClick={() => props.onMark(kind)}>
              {icon}
            </IconButton>
          ))}
        </div>
      )}
      {tool === "signature" && (
        <div className="signature-chips" data-tauri-drag-region>
          {props.signatures.map((signature) => (
            <div key={signature.uuid} className="signature-chip">
              <button type="button" title={`Place “${signature.description || "Signature"}”`} onClick={() => props.onPlaceSignature(signature.uuid)}>
                <SignaturePath preview={signature} />
              </button>
              <button type="button" className="forget" title="Remove saved signature" aria-label="Remove saved signature" onClick={() => props.onForgetSignature(signature.uuid)}>
                <X size={10} />
              </button>
            </div>
          ))}
          <IconButton title="New signature…" onClick={props.onNewSignature}>
            <Plus size={16} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
