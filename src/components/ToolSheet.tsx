import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { highlightColors } from "../hooks/usePdfViewer";
import { inkColors } from "../hooks/useEditorOptions";
import type { ToolSheetProps } from "../hooks/useToolChest";
import { shapeKinds } from "../lib/markup";
import { markupColors } from "../lib/markupParams";
import { lengthUnits, measureKinds, type LengthUnit } from "../lib/measure";
import { precisionOptions, unitNames } from "../lib/scaleChoice";
import { DASH, canDash, canFill, cleanFormat, cleanTool, fixedColor, hasOpacity, parseToolRef, toolLabel, toolRef, widthRange, type SavedTool, type ToolTarget } from "../lib/toolChest";
import { Slider } from "./MarkupTools";
import { ToolSwatch } from "./ToolSwatch";
import "./ToolChest.css";

const baseTargets: ToolTarget[] = [
  ...shapeKinds.map((shape): ToolTarget => ({ kind: "shape", shape })),
  { kind: "text", text: "underline" },
  { kind: "text", text: "strikeout" },
  ...measureKinds.map((measure): ToolTarget => ({ kind: "measure", measure })),
  { kind: "editor", editor: "highlight" },
  { kind: "editor", editor: "draw" },
  { kind: "editor", editor: "text" },
];

function ColorChoice({ color, swatches, onChange }: { color: string; swatches: string[]; onChange: (color: string) => void }) {
  const current = color.toLowerCase();
  const other = !swatches.some((swatch) => swatch.toLowerCase() === current);
  return (
    <div className="swatches" role="radiogroup" aria-label="Color">
      {swatches.map((swatch) => (
        <button key={swatch} type="button" role="radio" aria-checked={swatch.toLowerCase() === current} aria-label={swatch} className="swatch" style={{ background: swatch }} onClick={() => onChange(swatch.toLowerCase())} />
      ))}
      <label className="swatch other-color" title="Other color…" data-chosen={other || undefined} style={other ? ({ "--chosen-color": current } as CSSProperties) : undefined}>
        <input type="color" aria-label="Other color" value={current} onChange={(event) => onChange(event.target.value)} />
      </label>
    </div>
  );
}

export function ToolSheet({ request, groups, onSave, onClose }: ToolSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<SavedTool | null>(null);
  const groupList = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog) {
      setDraft(request.tool);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  const target = draft && parseToolRef(draft.tool);
  const targets = target?.kind === "stamp" ? [target, ...baseTargets] : baseTargets;
  const change = (patch: Partial<SavedTool>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const changeStyle = (patch: Partial<SavedTool["style"]>) => setDraft((current) => (current ? { ...current, style: { ...current.style, ...patch } } : current));
  const chooseTarget = (ref: string) => setDraft((current) => (current ? (cleanTool({ ...current, tool: ref }) ?? current) : current));
  const range = target && widthRange(target);
  const fixed = target && fixedColor(target);
  const valid = !!draft && draft.name.trim() !== "";
  const unit = draft?.measure?.unit ?? "";

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet tool-sheet"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          const saved = draft && cleanTool(draft);
          if (saved) {
            onSave(saved);
          }
        }}
      >
        <h2>{request?.mode === "edit" ? "Edit Tool" : "Save as Tool"}</h2>
        <p className="dialog-hint">Markups made with this tool are named after it, so the Markups tab counts them on their own.</p>
        {draft && target && (
          <div className="label-form">
            <span className="label-form-name">Preview</span>
            <ToolSwatch tool={draft} large />
            <label className="label-form-name" htmlFor="tool-name">
              Name
            </label>
            <input id="tool-name" className="text-input" autoFocus maxLength={80} placeholder="Type A fixture" value={draft.name} onChange={(event) => change({ name: event.target.value })} />
            <label className="label-form-name" htmlFor="tool-group">
              Group
            </label>
            <input id="tool-group" className="text-input" list={groupList} maxLength={80} placeholder="Optional, like Electrical" value={draft.group ?? ""} onChange={(event) => change({ group: event.target.value || null })} />
            <datalist id={groupList}>
              {groups.map((group) => (
                <option key={group} value={group} />
              ))}
            </datalist>
            <label className="label-form-name" htmlFor="tool-kind">
              Tool
            </label>
            <select id="tool-kind" className="text-input" value={draft.tool} onChange={(event) => chooseTarget(event.target.value)}>
              {targets.map((option) => (
                <option key={toolRef(option)} value={toolRef(option)}>
                  {option.kind === "stamp" ? `Stamp: ${toolLabel(option)}` : toolLabel(option)}
                </option>
              ))}
            </select>
            <span className="label-form-name">Color</span>
            {fixed ? (
              <span className="label-form-note">Uses the stamp's own color</span>
            ) : (
              <ColorChoice
                color={draft.style.color}
                swatches={target.kind === "editor" ? (target.editor === "highlight" ? Object.values(highlightColors) : inkColors) : markupColors}
                onChange={(color) => changeStyle({ color })}
              />
            )}
            {(canFill(target) || canDash(target)) && (
              <>
                <span className="label-form-name">Style</span>
                <span className="tool-sheet-checks">
                  {canFill(target) && (
                    <label className="tool-menu-check">
                      <input type="checkbox" checked={draft.style.fill} onChange={(event) => changeStyle({ fill: event.target.checked })} />
                      Fill
                    </label>
                  )}
                  {canDash(target) && (
                    <label className="tool-menu-check">
                      <input type="checkbox" checked={!!draft.style.dash} onChange={(event) => changeStyle({ dash: event.target.checked ? DASH : null })} />
                      Dashed
                    </label>
                  )}
                </span>
              </>
            )}
            {range && (
              <>
                <span className="label-form-name">{target.kind === "editor" && target.editor === "text" ? "Font size" : "Thickness"}</span>
                <Slider label="" value={draft.style.width} min={range.min} max={range.max} step={range.max > 20 ? 1 : 0.5} format={(value) => `${value} pt`} onChange={(width) => changeStyle({ width })} />
              </>
            )}
            {hasOpacity(target) && (
              <>
                <span className="label-form-name">Opacity</span>
                <Slider label="" value={draft.style.opacity} min={0.1} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(opacity) => changeStyle({ opacity })} />
              </>
            )}
            {target.kind === "measure" && (
              <>
                <label className="label-form-name" htmlFor="tool-unit">
                  Units
                </label>
                <span className="label-form-range scale-lengths">
                  <select
                    id="tool-unit"
                    className="text-input"
                    value={unit}
                    onChange={(event) => change({ measure: event.target.value ? cleanFormat({ unit: event.target.value, precision: draft.measure?.precision }) : undefined })}
                  >
                    <option value="">Page's scale</option>
                    {lengthUnits.map((option) => (
                      <option key={option} value={option}>
                        {unitNames[option]}
                      </option>
                    ))}
                  </select>
                  {unit && (
                    <select
                      aria-label="Precision"
                      className="text-input"
                      value={draft.measure?.precision}
                      onChange={(event) => change({ measure: cleanFormat({ unit, precision: Number(event.target.value) }) })}
                    >
                      {precisionOptions(unit as LengthUnit).map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </>
            )}
          </div>
        )}
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={!valid}>
            {request?.mode === "edit" ? "Save" : "Add to Tool Chest"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
