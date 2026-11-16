import { useEffect, useRef, useState } from "react";
import { MM_PER_INCH, POINTS_PER_INCH, formatInches, formatLength, fullSize, lengthUnits, scalePresets, unitIsMetric, type LengthUnit, type MeasureFormat, type MeasureScale, type ScaleGroup } from "../lib/measure";
import type { PageScale } from "../lib/measurePdf";
import { CUSTOM, FULL_SIZE, changesScale, customScale, fittedFormat, precisionOptions, presetKey, scaleForKey, scaleKey, startingScale, unitNames } from "../lib/scaleChoice";

export type ScaleRequest = { pages: number[]; pagesCount: number; pageName: string; scales: Array<PageScale | null> };

type ScaleDialogProps = {
  request: ScaleRequest | null;
  onApply: (pages: number[], scale: PageScale | null) => void;
  onClose: () => void;
};

const groups: ScaleGroup[] = ["Architectural", "Engineering", "Metric"];

function customParts(start: PageScale) {
  const [paper, real] = start.scale.label.split(" = ");
  return real ? [paper, real] : ['1"', formatInches(start.scale.inchesPerPoint * POINTS_PER_INCH, start.format)];
}

const previewOf = (scale: MeasureScale, format: MeasureFormat) =>
  unitIsMetric(format.unit)
    ? `10 mm on the page = ${formatLength((10 / MM_PER_INCH) * POINTS_PER_INCH, scale, format)}`
    : `1" on the page = ${formatLength(POINTS_PER_INCH, scale, format)}`;

export function ScaleDialog({ request, onApply, onClose }: ScaleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [allPages, setAllPages] = useState(false);
  const [key, setKey] = useState(FULL_SIZE);
  const [paper, setPaper] = useState("");
  const [real, setReal] = useState("");
  const [unit, setUnit] = useState<LengthUnit>("ft-in");
  const [precision, setPrecision] = useState(16);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog && !dialog.open) {
      const start = startingScale(request.scales, request.pages);
      const [startPaper, startReal] = customParts(start);
      setAllPages(false);
      setKey(scaleKey(start.scale));
      setPaper(startPaper);
      setReal(startReal);
      setUnit(start.format.unit);
      setPrecision(start.format.precision);
      dialog.showModal();
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  const format = fittedFormat(unit, precision);
  const scale = key === CUSTOM ? customScale(paper, real, unit) : scaleForKey(key);
  const targets = request ? (allPages ? Array.from({ length: request.pagesCount }, (_, page) => page) : request.pages) : [];
  const next = scale && { scale, format };
  const changed = !!request && !!next && changesScale(request.scales, targets, next);
  const scaled = !!request && targets.some((page) => request.scales[page]);
  const chosenName = request && (request.pages.length > 1 ? `${request.pages.length} selected pages` : request.pageName);

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (next && changed) {
            onApply(targets, next);
          }
        }}
      >
        <h2>Set Scale</h2>
        <p className="dialog-hint">Measurements on these pages use this scale. Measurements already made keep the scale they were made at.</p>
        <div className="label-form">
          <label className="label-form-name" htmlFor="scale-pages">
            Pages
          </label>
          <select id="scale-pages" className="text-input" value={allPages ? "all" : "chosen"} onChange={(event) => setAllPages(event.target.value === "all")}>
            <option value="chosen">{chosenName}</option>
            {request && request.pagesCount > request.pages.length && <option value="all">All {request.pagesCount} pages</option>}
          </select>
          <label className="label-form-name" htmlFor="scale-preset">
            Scale
          </label>
          <select id="scale-preset" className="text-input" autoFocus value={key} onChange={(event) => setKey(event.target.value)}>
            <option value={FULL_SIZE}>{fullSize.label}</option>
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {scalePresets.map((preset, index) =>
                  preset.group === group ? (
                    <option key={preset.label} value={presetKey(index)}>
                      {preset.label}
                    </option>
                  ) : null,
                )}
              </optgroup>
            ))}
            <option value={CUSTOM}>Custom…</option>
          </select>
          {key === CUSTOM && (
            <>
              <span className="label-form-name">Ratio</span>
              <span className="label-form-range">
                <input className="text-input" aria-label="Length on the page" placeholder='1/4"' value={paper} onChange={(event) => setPaper(event.target.value)} />
                <span>=</span>
                <input className="text-input" aria-label="Real length" placeholder="1'" value={real} onChange={(event) => setReal(event.target.value)} />
              </span>
            </>
          )}
          <label className="label-form-name" htmlFor="scale-unit">
            Units
          </label>
          <select id="scale-unit" className="text-input" value={unit} onChange={(event) => setUnit(event.target.value as LengthUnit)}>
            {lengthUnits.map((value) => (
              <option key={value} value={value}>
                {unitNames[value]}
              </option>
            ))}
          </select>
          <label className="label-form-name" htmlFor="scale-precision">
            Precision
          </label>
          <select id="scale-precision" className="text-input" value={format.precision} onChange={(event) => setPrecision(Number(event.target.value))}>
            {precisionOptions(unit).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
          <span className="label-form-name">Preview</span>
          <output className="label-form-preview">{scale ? previewOf(scale, format) : `Enter both lengths, like 1/4" = 1'`}</output>
        </div>
        <div className="dialog-actions">
          {scaled && (
            <button type="button" className="button" onClick={() => onApply(targets, null)}>
              Remove Scale
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={!changed}>
            Apply
          </button>
        </div>
      </form>
    </dialog>
  );
}
