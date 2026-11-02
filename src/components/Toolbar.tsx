import { useEffect, useState } from "react";
import { Code, FolderOpen, Minus, Moon, PanelLeft, Plus, RotateCw, Save, Search, Sun } from "lucide-react";
import { shortcutFor, type CommandId } from "../lib/commands";
import { hasCustomLabels, pageFromInput, pageLabelOf } from "../lib/pageLabels";
import { isMac } from "../lib/platform";
import type { MarkdownMode } from "../lib/tabs";
import { IconButton } from "./IconButton";
import { ToolsGroup, type ToolsProps } from "./ToolsGroup";

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
  tools: ToolsProps;
  onToggleSidebar: () => void;
  onOpen: () => void;
  onSave: () => void;
  onPage: (page: number) => void;
  onZoom: (direction: 1 | -1) => void;
  onZoomValue: (value: string) => void;
  onRotate: () => void;
  onToggleFind: () => void;
  onToggleDarkPages: () => void;
  onToggleSource: () => void;
};

const withShortcut = (label: string, id: CommandId) => {
  const shortcut = shortcutFor(id, isMac);
  return shortcut ? `${label} (${shortcut})` : label;
};

export function Toolbar(props: ToolbarProps) {
  const { hasDocument, markdownMode, pageNumber, pagesCount, pageLabels, scale, scaleValue } = props;
  const hasFile = hasDocument || !!markdownMode;
  const pageText = pageLabelOf(pageLabels, pageNumber);
  const [pageInput, setPageInput] = useState(pageText);
  const labeled = hasCustomLabels(pageLabels);

  useEffect(() => setPageInput(pageText), [pageText]);

  const isPreset = zoomPresets.some((preset) => preset.value === scaleValue);

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

          <ToolsGroup {...props.tools} />
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
