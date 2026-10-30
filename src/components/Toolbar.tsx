import { useEffect, useState, type ReactNode } from "react";
import {
  Code,
  FolderOpen,
  Hand,
  Highlighter,
  ImagePlus,
  Minus,
  Moon,
  MousePointer2,
  PanelLeft,
  PenLine,
  Plus,
  RotateCw,
  Save,
  Search,
  Signature,
  Sun,
  Type,
} from "lucide-react";
import { inkColors, toolOptions } from "../hooks/useEditorOptions";
import type { EditorParams, EditorTool } from "../hooks/usePdfViewer";
import { shortcutFor, type CommandId } from "../lib/commands";
import { hasCustomLabels, pageFromInput, pageLabelOf } from "../lib/pageLabels";
import { isMac } from "../lib/platform";
import type { MarkdownMode } from "../lib/tabs";
import { highlightColors } from "../hooks/usePdfViewer";

const zoomPresets = [
  { value: "auto", label: "Automatic" },
  { value: "page-width", label: "Fit width" },
  { value: "page-fit", label: "Fit page" },
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
];

type ToolbarProps = {
  titlebarInset: boolean;
  hasDocument: boolean;
  markdownMode: MarkdownMode | null;
  sidebarOpen: boolean;
  findOpen: boolean;
  darkPages: boolean;
  darkPagesImages: "keep" | "invert";
  onDarkPagesImages: (value: "keep" | "invert") => void;
  pageNumber: number;
  pagesCount: number;
  pageLabels: string[] | null;
  scale: number;
  scaleValue: string;
  tool: EditorTool;
  toolColor: string;
  editorParams: EditorParams;
  onEditorParam: (type: number, value: number) => void;
  onToggleSidebar: () => void;
  onOpen: () => void;
  onSave: () => void;
  onPage: (page: number) => void;
  onZoom: (direction: 1 | -1) => void;
  onZoomValue: (value: string) => void;
  onRotate: () => void;
  onTool: (tool: EditorTool) => void;
  onToolColor: (color: string) => void;
  onImage: () => void;
  onSign: () => void;
  onToggleFind: () => void;
  onToggleDarkPages: () => void;
  onToggleSource: () => void;
};

const withShortcut = (label: string, id: CommandId) => {
  const shortcut = shortcutFor(id, isMac);
  return shortcut ? `${label} (${shortcut})` : label;
};

function IconButton({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="icon-button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Toolbar(props: ToolbarProps) {
  const { hasDocument, markdownMode, pageNumber, pagesCount, pageLabels, scale, scaleValue, tool, toolColor } = props;
  const hasFile = hasDocument || !!markdownMode;
  const pageText = pageLabelOf(pageLabels, pageNumber);
  const [pageInput, setPageInput] = useState(pageText);
  const labeled = hasCustomLabels(pageLabels);

  useEffect(() => setPageInput(pageText), [pageText]);

  const isPreset = zoomPresets.some((preset) => preset.value === scaleValue);
  const swatches = tool === "highlight" ? Object.values(highlightColors) : tool === "text" || tool === "draw" ? inkColors : [];

  return (
    <header className={`toolbar${props.titlebarInset ? " titlebar-inset" : ""}`} data-tauri-drag-region>
      <div className="toolbar-group" data-tauri-drag-region>
        <IconButton title={withShortcut("Toggle sidebar", "toggleSidebar")} active={props.sidebarOpen} disabled={!hasFile} onClick={props.onToggleSidebar}>
          <PanelLeft size={18} />
        </IconButton>
        <IconButton title={withShortcut("Open", "open")} onClick={props.onOpen}>
          <FolderOpen size={18} />
        </IconButton>
        <IconButton title={withShortcut("Save", "save")} disabled={!hasFile} onClick={props.onSave}>
          <Save size={18} />
        </IconButton>
      </div>

      {hasDocument && (
        <>
          <div className="toolbar-group" data-tauri-drag-region>
            <form
              className="page-nav"
              onSubmit={(event) => {
                event.preventDefault();
                const page = pageFromInput(pageInput, pageLabels, pagesCount);
                if (page) {
                  props.onPage(page);
                }
                setPageInput(pageText);
              }}
            >
              <input
                aria-label={labeled ? "Page label or number" : "Page number"}
                inputMode={labeled ? "text" : "numeric"}
                className={labeled ? "labeled" : undefined}
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                onBlur={() => setPageInput(pageText)}
                onFocus={(event) => event.target.select()}
              />
              <span>{labeled && pageText !== String(pageNumber) ? `(${pageNumber} of ${pagesCount})` : `/ ${pagesCount}`}</span>
            </form>
          </div>

          <div className="toolbar-group" data-tauri-drag-region>
            <IconButton title="Zoom out (⌘−)" onClick={() => props.onZoom(-1)}>
              <Minus size={16} />
            </IconButton>
            <select aria-label="Zoom" value={isPreset ? scaleValue : "custom"} onChange={(event) => props.onZoomValue(event.target.value)}>
              {!isPreset && <option value="custom">{Math.round(scale * 100)}%</option>}
              {zoomPresets.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
            <IconButton title="Zoom in (⌘+)" onClick={() => props.onZoom(1)}>
              <Plus size={16} />
            </IconButton>
            <IconButton title={withShortcut("Rotate", "rotateRight")} onClick={props.onRotate}>
              <RotateCw size={16} />
            </IconButton>
          </div>

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
            <IconButton title="Add image" active={tool === "image"} onClick={props.onImage}>
              <ImagePlus size={18} />
            </IconButton>
            <IconButton title="Sign" onClick={props.onSign}>
              <Signature size={18} />
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
          </div>
        </>
      )}

      <div className="toolbar-group end" data-tauri-drag-region>
        {markdownMode && (
          <IconButton title={withShortcut("Markdown source", "toggleMarkdownSource")} active={markdownMode === "source"} onClick={props.onToggleSource}>
            <Code size={18} />
          </IconButton>
        )}
        {hasDocument && props.darkPages && (
          <select
            aria-label="Images in dark pages"
            title="How images look on dark pages"
            value={props.darkPagesImages}
            onChange={(event) => props.onDarkPagesImages(event.target.value as "keep" | "invert")}
          >
            <option value="keep">Keep images</option>
            <option value="invert">Invert images</option>
          </select>
        )}
        <IconButton title={props.darkPages ? "Light pages" : "Dark pages"} active={props.darkPages} disabled={!hasDocument} onClick={props.onToggleDarkPages}>
          {props.darkPages ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
        <IconButton title={withShortcut("Find", "find")} active={props.findOpen} disabled={!hasFile} onClick={props.onToggleFind}>
          <Search size={18} />
        </IconButton>
      </div>
    </header>
  );
}
