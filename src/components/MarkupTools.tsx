import type { CSSProperties, ReactNode } from "react";
import { Circle, Cloud, MoveUpRight, Slash, Square, Stamp } from "lucide-react";
import type { ShapeKind } from "../lib/markup";
import { markupColors, type MarkupParams, type TextMode } from "../lib/markupParams";
import { IconButton } from "./IconButton";
import { closeToolMenu, ToolMenu } from "./ToolMenu";
import type { ContextMenuFor, ToolsProps } from "./ToolsGroup";

const shapes: Array<{ kind: ShapeKind; label: string; icon: ReactNode }> = [
  { kind: "rectangle", label: "Rectangle", icon: <Square size={16} /> },
  { kind: "ellipse", label: "Ellipse", icon: <Circle size={16} /> },
  { kind: "cloud", label: "Cloud", icon: <Cloud size={16} /> },
  { kind: "line", label: "Line", icon: <Slash size={16} /> },
  { kind: "arrow", label: "Arrow", icon: <MoveUpRight size={16} /> },
];

const textModes: Array<{ mode: TextMode; label: string }> = [
  { mode: "highlight", label: "Highlight" },
  { mode: "underline", label: "Underline" },
  { mode: "strikeout", label: "Strikethrough" },
];

export function MarkupColors({ params, onChange }: { params: MarkupParams; onChange: (patch: Partial<MarkupParams>) => void }) {
  const color = params.color.toLowerCase();
  const other = !markupColors.includes(color);
  return (
    <div className="swatches" role="radiogroup" aria-label="Color">
      {markupColors.map((swatch) => (
        <button key={swatch} type="button" role="radio" aria-checked={swatch === color} aria-label={swatch} className="swatch" style={{ background: swatch }} onClick={() => onChange({ color: swatch })} />
      ))}
      <label className="swatch other-color" title="Other color…" data-chosen={other || undefined} style={other ? ({ "--chosen-color": color } as CSSProperties) : undefined}>
        <input type="color" aria-label="Other color" value={color} onChange={(event) => onChange({ color: event.target.value })} />
      </label>
    </div>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (value: number) => string; onChange: (value: number) => void }) {
  return (
    <label className="tool-option">
      <span className="tool-option-label">{label}</span>
      <span className="tool-option-value">{format(value)}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function TextModeChoice({ props }: { props: ToolsProps }) {
  const current = props.tool === "underline" || props.tool === "strikeout" ? props.tool : props.tool === "highlight" ? "highlight" : props.markup.textMode;
  return (
    <div className="segmented" role="radiogroup" aria-label="Text markup">
      {textModes.map(({ mode, label }) => (
        <button key={mode} type="button" role="radio" aria-checked={current === mode} onClick={() => props.onTextMode(mode)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function TextMarkupSettings({ props }: { props: ToolsProps }) {
  return <MarkupColors params={props.markup} onChange={props.onMarkupParams} />;
}

export function ShapesTool({ props, onContextMenu }: { props: ToolsProps; onContextMenu: ContextMenuFor }) {
  const active = props.tool === "shape";
  const { markup } = props;
  const current = shapes.find((shape) => shape.kind === markup.shape) ?? shapes[0];
  const canFill = markup.shape === "rectangle" || markup.shape === "ellipse" || markup.shape === "cloud";
  return (
    <ToolMenu
      label="Shape options"
      active={active}
      keepOpenWhenInactive
      button={
        <IconButton title={`Shapes: ${current.label}`} active={active} onContextMenu={onContextMenu("shape")} onClick={() => props.onShape(markup.shape)}>
          {current.icon}
        </IconButton>
      }
    >
      <div className="tool-menu-items">
        {shapes.map(({ kind, label, icon }) => (
          <button
            key={kind}
            type="button"
            className="tool-menu-item"
            aria-pressed={markup.shape === kind}
            onClick={(event) => {
              closeToolMenu(event.currentTarget);
              props.onShape(kind);
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      <MarkupColors params={markup} onChange={props.onMarkupParams} />
      {canFill && (
        <label className="tool-menu-check">
          <input type="checkbox" checked={markup.fill} onChange={(event) => props.onMarkupParams({ fill: event.target.checked })} />
          Fill
        </label>
      )}
      <Slider label="Thickness" value={markup.width} min={0.5} max={12} step={0.5} format={(value) => `${value} pt`} onChange={(width) => props.onMarkupParams({ width })} />
      <Slider label="Opacity" value={markup.opacity} min={0.1} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(opacity) => props.onMarkupParams({ opacity })} />
    </ToolMenu>
  );
}

export function StampTool({ props, onContextMenu }: { props: ToolsProps; onContextMenu: ContextMenuFor }) {
  return (
    <IconButton title="Stamps…" active={props.tool === "stamp"} onContextMenu={onContextMenu("stamp")} onClick={props.onStamps}>
      <Stamp size={18} />
    </IconButton>
  );
}
