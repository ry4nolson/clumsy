import { useEffect, useRef, useState } from "react";
import type { OverlayChoice, OverlayRequest, OverlaySide, OverlayStatus } from "../hooks/useOverlay";
import { describeAlignment } from "../lib/alignment";
import type { Matrix } from "../lib/contentPlacements";
import { choicesByLabel, choicesByNumber, pairsFrom, withChoice, type OverlayPair, type PairChoices } from "../lib/overlayPairs";
import { cssColor, overlayColorChoices, overlayColors, type OverlayColorsId } from "../lib/overlayPlan";
import { AlignPointsDialog, type AlignRequest } from "./AlignPointsDialog";
import "./Overlay.css";

type OverlayDialogProps = {
  request: OverlayRequest | null;
  status: OverlayStatus;
  colors: OverlayColorsId;
  onColors: (id: OverlayColorsId) => void;
  onCurrentTab: (tabId: string) => void;
  onChooseFile: () => void;
  onSwap: () => void;
  onBuild: (choice: OverlayChoice) => void;
  onStop: () => void;
  onClose: () => void;
};

type Mode = "page" | "label" | "number";

const MAX_LISTED = 40_000;
const CHOOSE_FILE = "__file";

const sheetCount = (count: number) => (count === 1 ? "1 sheet" : `${count} sheets`);

function summary(pairs: OverlayPair[]) {
  const both = pairs.filter((pair) => pair.previous !== null && pair.current !== null).length;
  const removed = pairs.filter((pair) => pair.current === null).length;
  const added = pairs.filter((pair) => pair.previous === null).length;
  return [`${sheetCount(both)} overlaid`, removed ? `${removed} only in previous` : "", added ? `${added} only in current` : ""].filter(Boolean).join(", ");
}

function alignmentLabel(alignment: Matrix | null) {
  if (!alignment) {
    return "Page edges, centered";
  }
  const { scale, turn } = describeAlignment(alignment);
  const parts = [Math.abs(scale - 1) > 0.0005 ? `scaled ${(scale * 100).toFixed(1)}%` : "", Math.abs(turn) > 0.05 ? `turned ${turn.toFixed(1)}°` : ""].filter(Boolean);
  return `By points${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

const pageOptions = (side: OverlaySide) =>
  side.labels.map((label, index) => (
    <option key={index} value={index}>
      {label === String(index + 1) ? `Page ${label}` : `${label} (page ${index + 1})`}
    </option>
  ));

export function OverlayDialog({ request, status, colors, onColors, onCurrentTab, onChooseFile, onSwap, onBuild, onStop, onClose }: OverlayDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>("page");
  const [pages, setPages] = useState({ previous: 0, current: 0 });
  const [choices, setChoices] = useState<PairChoices>([]);
  const [alignment, setAlignment] = useState<Matrix | null>(null);
  const [markChanges, setMarkChanges] = useState(false);
  const [aligning, setAligning] = useState<AlignRequest | null>(null);
  const previous = request?.previous ?? null;
  const current = request?.current ?? null;
  const working = status.kind === "working";
  const palette = overlayColors(colors);
  const canLabel = !!previous?.labeled && !!current?.labeled;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog && !dialog.open) {
      setMarkChanges(false);
      dialog.showModal();
    } else if (!request && dialog?.open) {
      setAligning(null);
      dialog.close();
    }
  }, [request]);

  useEffect(() => {
    setAlignment(null);
    setPages({ previous: previous?.page ?? 0, current: current?.page ?? 0 });
    const many = !!previous && !!current && (previous.count > 1 || current.count > 1);
    setMode(many ? (previous.labeled && current.labeled ? "label" : "number") : "page");
  }, [previous?.id, current?.id]);

  useEffect(() => {
    if (previous && current && mode !== "page") {
      setChoices(mode === "label" ? choicesByLabel(previous.labels, current.labels) : choicesByNumber(previous.count, current.count));
    }
  }, [previous?.id, current?.id, mode]);

  const pairs: OverlayPair[] = !previous || !current ? [] : mode === "page" ? [pages] : pairsFrom(choices, current.count);
  const first = pairs.find((pair) => pair.previous !== null && pair.current !== null);
  const listed = !!previous && !!current && mode !== "page" && previous.count * current.count <= MAX_LISTED;

  useEffect(() => setAlignment(null), [first?.previous, first?.current]);

  const modeOption = (value: Mode, label: string, disabled = false) => (
    <label className="radio">
      <input type="radio" name="overlay-pages" checked={mode === value} disabled={disabled} onChange={() => setMode(value)} />
      {label}
    </label>
  );

  const startAligning = () => {
    if (previous && current && first && first.previous !== null && first.current !== null) {
      setAligning({
        previous: { doc: previous.doc, page: first.previous, name: previous.name, label: previous.labels[first.previous], color: cssColor(palette.previous) },
        current: { doc: current.doc, page: first.current, name: current.name, label: current.labels[first.current], color: cssColor(palette.current) },
      });
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet overlay-sheet"
      onCancel={(event) => {
        event.preventDefault();
        if (working) {
          onStop();
        } else {
          onClose();
        }
      }}
    >
      {working ? (
        <>
          <h2>Overlaying Drawings</h2>
          <p className="dialog-hint" role="status">
            {status.total ? `${status.step} ${Math.min(status.total, status.done + 1)} of ${status.total}…` : status.step}
          </p>
          <progress className="export-progress" max={status.total || undefined} value={status.total ? status.done : undefined} />
          <div className="dialog-actions">
            <span className="spacer" />
            <button type="button" className="button" onClick={onStop}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            if (pairs.length) {
              onBuild({ pairs, alignment, markChanges });
            }
          }}
        >
          <h2>Overlay Drawings</h2>
          <p className="dialog-hint">
            Lays two revisions on top of each other in a new PDF. Lines only in the previous drawing turn{" "}
            <b>
              <span className="overlay-swatch" style={{ background: cssColor(palette.previous) }} />
              {palette.previousName}
            </b>
            , lines only in the current one turn{" "}
            <b>
              <span className="overlay-swatch" style={{ background: cssColor(palette.current) }} />
              {palette.currentName}
            </b>
            , and what they share stays dark.
          </p>
          <div className="export-options overlay-options">
            <span className="export-label">Previous</span>
            <div className="overlay-side">
              <span className="overlay-name" title={previous?.name}>
                {previous?.name}
              </span>
              <button type="button" className="button" disabled={!current} onClick={onSwap}>
                Swap
              </button>
            </div>
            <label className="export-label" htmlFor="overlay-current">
              Current
            </label>
            <select
              id="overlay-current"
              className="text-input"
              value={current?.tabId ?? (current ? current.id : "")}
              onChange={(event) => (event.target.value === CHOOSE_FILE ? onChooseFile() : onCurrentTab(event.target.value))}
            >
              {!current && <option value="">Choose the newer revision…</option>}
              {current && !current.tabId && <option value={current.id}>{current.name}</option>}
              {request?.tabs
                .filter((tab) => tab.id !== previous?.id)
                .map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.name}
                  </option>
                ))}
              <option value={CHOOSE_FILE}>Choose File…</option>
            </select>
            {previous && current && (
              <>
                <span className="export-label overlay-top">Sheets</span>
                <div className="export-choices stacked">
                  <div className="overlay-pages">
                    {modeOption("page", "One sheet:")}
                    <select
                      className="text-input"
                      aria-label="Previous sheet"
                      value={pages.previous}
                      onFocus={() => setMode("page")}
                      onChange={(event) => setPages({ ...pages, previous: Number(event.target.value) })}
                    >
                      {pageOptions(previous)}
                    </select>
                    <span>over</span>
                    <select
                      className="text-input"
                      aria-label="Current sheet"
                      value={pages.current}
                      onFocus={() => setMode("page")}
                      onChange={(event) => setPages({ ...pages, current: Number(event.target.value) })}
                    >
                      {pageOptions(current)}
                    </select>
                  </div>
                  {modeOption("label", canLabel ? "Every sheet, matched by page label" : "Every sheet, matched by page label (both files need labels)", !canLabel)}
                  {modeOption("number", "Every sheet, matched by page number")}
                </div>
                {mode !== "page" && (
                  <div className="overlay-pairs">
                    <p className="export-note">{summary(pairs)}. Sheets in only one file go at the end in that file’s color.</p>
                    {listed && (
                      <ul className="overlay-pair-list">
                        {previous.labels.map((label, row) => (
                          <li key={row}>
                            <span title={label}>{label}</span>
                            <select
                              className="text-input"
                              aria-label={`Current sheet for ${label}`}
                              value={choices[row] ?? ""}
                              onChange={(event) => setChoices(withChoice(choices, row, event.target.value === "" ? null : Number(event.target.value)))}
                            >
                              <option value="">Not in current</option>
                              {pageOptions(current)}
                            </select>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <label className="export-label" htmlFor="overlay-colors">
                  Colors
                </label>
                <select id="overlay-colors" className="text-input" value={colors} onChange={(event) => onColors(event.target.value as OverlayColorsId)}>
                  {overlayColorChoices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                <span className="export-label">Alignment</span>
                <div className="overlay-side">
                  <span className="overlay-name">{alignmentLabel(alignment)}</span>
                  {alignment && (
                    <button type="button" className="button" onClick={() => setAlignment(null)}>
                      Reset
                    </button>
                  )}
                  <button type="button" className="button" disabled={!first} onClick={startAligning}>
                    Align by Points…
                  </button>
                </div>
                <label className="radio overlay-check">
                  <input type="checkbox" checked={markChanges} onChange={(event) => setMarkChanges(event.target.checked)} />
                  Draw clouds around what changed
                </label>
              </>
            )}
          </div>
          {status.kind === "failed" && (
            <p className="overlay-error" role="alert">
              Couldn’t build the overlay. {status.message}
            </p>
          )}
          <div className="dialog-actions">
            <span className="spacer" />
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={!pairs.length}>
              Create Overlay
            </button>
          </div>
        </form>
      )}
      <AlignPointsDialog
        request={aligning}
        onClose={() => setAligning(null)}
        onDone={(matrix) => {
          setAlignment(matrix);
          setAligning(null);
        }}
      />
    </dialog>
  );
}
