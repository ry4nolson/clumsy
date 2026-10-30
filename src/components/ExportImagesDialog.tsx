import { useEffect, useRef, useState } from "react";
import type { ExportProgress, ExportRequest } from "../hooks/useImageExport";
import { exportResolutions, type ExportOptions } from "../lib/imageExport";

type ExportImagesDialogProps = {
  request: ExportRequest | null;
  progress: ExportProgress | null;
  options: ExportOptions;
  onExport: (options: ExportOptions, selectionOnly: boolean) => void;
  onClose: () => void;
  onStop: () => void;
};

const resolutionLabels: Record<number, string> = { 72: "72 dpi (screen)", 150: "150 dpi", 300: "300 dpi (print)" };

const countLabel = (count: number) => (count === 1 ? "1 page" : `${count} pages`);

export function ExportImagesDialog({ request, progress, options, onExport, onClose, onStop }: ExportImagesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState(options);
  const [selectionOnly, setSelectionOnly] = useState(true);
  const open = !!request || !!progress;
  const selected = request?.selection.length ?? 0;
  const canChoosePages = !!request && selected > 0 && selected < request.pageCount;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request) {
      setChoice(options);
      setSelectionOnly(true);
    }
    if (open && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  }, [open, request]);

  const exportedCount = !request ? 0 : canChoosePages && selectionOnly ? selected : request.pageCount;

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet export-images"
      onCancel={(event) => {
        event.preventDefault();
        if (progress) {
          onStop();
        } else {
          onClose();
        }
      }}
    >
      {progress ? (
        <>
          <h2>Exporting Pages</h2>
          <p className="dialog-hint">
            Page {progress.done + 1} of {progress.total}
          </p>
          <progress className="export-progress" max={progress.total} value={progress.done} />
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
            onExport(choice, canChoosePages && selectionOnly);
          }}
        >
          <h2>Export Pages as Images</h2>
          <p className="dialog-hint">
            {countLabel(exportedCount)} of “{request?.name}”, one image per page.
          </p>
          <div className="export-options">
            {canChoosePages && (
              <>
                <span className="export-label">Pages</span>
                <div className="export-choices">
                  <label className="radio">
                    <input type="radio" name="pages" checked={selectionOnly} onChange={() => setSelectionOnly(true)} />
                    Selected ({countLabel(selected)})
                  </label>
                  <label className="radio">
                    <input type="radio" name="pages" checked={!selectionOnly} onChange={() => setSelectionOnly(false)} />
                    All ({countLabel(request.pageCount)})
                  </label>
                </div>
              </>
            )}
            <span className="export-label">Format</span>
            <div className="export-choices">
              {(["png", "jpeg"] as const).map((format) => (
                <label key={format} className="radio">
                  <input type="radio" name="format" checked={choice.format === format} onChange={() => setChoice({ ...choice, format })} />
                  {format.toUpperCase()}
                </label>
              ))}
            </div>
            <label className="export-label" htmlFor="export-resolution">
              Resolution
            </label>
            <select
              id="export-resolution"
              className="select-input"
              value={choice.dpi}
              onChange={(event) => setChoice({ ...choice, dpi: Number(event.target.value) as ExportOptions["dpi"] })}
            >
              {exportResolutions.map((dpi) => (
                <option key={dpi} value={dpi}>
                  {resolutionLabels[dpi]}
                </option>
              ))}
            </select>
            {choice.format === "jpeg" && (
              <>
                <label className="export-label" htmlFor="export-quality">
                  Quality
                </label>
                <div className="export-quality">
                  <input
                    id="export-quality"
                    type="range"
                    min={50}
                    max={100}
                    step={5}
                    value={Math.round(choice.quality * 100)}
                    onChange={(event) => setChoice({ ...choice, quality: Number(event.target.value) / 100 })}
                  />
                  <output htmlFor="export-quality">{Math.round(choice.quality * 100)}%</output>
                </div>
              </>
            )}
          </div>
          <div className="dialog-actions">
            <span className="spacer" />
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary" autoFocus>
              Export…
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
