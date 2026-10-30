import { useEffect, useRef, useState } from "react";
import type { ExportProgress, ExportRequest } from "../hooks/useImageExport";
import { exportPixelSize, exportResolutions, pagesToExport, type ExportOptions, type PageChoice } from "../lib/imageExport";
import { formatPageRange, parsePageRange } from "../lib/pageRanges";

type ExportImagesDialogProps = {
  request: ExportRequest | null;
  progress: ExportProgress | null;
  options: ExportOptions;
  onExport: (options: ExportOptions, pages: number[]) => void;
  onClose: () => void;
  onStop: () => void;
};

const countLabel = (count: number) => (count === 1 ? "1 page" : `${count} pages`);

export function ExportImagesDialog({ request, progress, options, onExport, onClose, onStop }: ExportImagesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const [choice, setChoice] = useState(options);
  const [pageChoice, setPageChoice] = useState<PageChoice>("all");
  const [rangeText, setRangeText] = useState("");
  const open = !!request || !!progress;
  const selection = request?.selection ?? [];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request) {
      setChoice(options);
      setPageChoice(selection.length ? "selected" : "all");
      setRangeText(formatPageRange(selection.length ? selection : [request.currentPage]));
    }
    if (open && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  }, [open, request]);

  const range = request ? parsePageRange(rangeText, request.pageCount) : null;
  const pages = request ? pagesToExport(pageChoice, { pageCount: request.pageCount, currentPage: request.currentPage, selection, range }) : [];
  const pixels = request ? exportPixelSize(request.pageSize.width, request.pageSize.height, choice.dpi) : null;

  const pageOption = (value: PageChoice, label: string) => (
    <label className="radio">
      <input
        type="radio"
        name="pages"
        checked={pageChoice === value}
        onChange={() => {
          setPageChoice(value);
          if (value === "range") {
            rangeRef.current?.select();
          }
        }}
      />
      {label}
    </label>
  );

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
            if (pages.length) {
              onExport(choice, pages);
            }
          }}
        >
          <h2>Export Pages as Images</h2>
          <p className="dialog-hint">
            {countLabel(pages.length)} of “{request?.name}”, one image per page.
          </p>
          <div className="export-options">
            <span className="export-label">Pages</span>
            <div className="export-choices stacked">
              {pageOption("all", `All (${request?.pageCount ?? 0})`)}
              {pageOption("current", `Current page (${(request?.currentPage ?? 0) + 1})`)}
              {selection.length > 0 && pageOption("selected", `Selected (${formatPageRange(selection)})`)}
              <div className="export-range">
                {pageOption("range", "Range")}
                <input
                  ref={rangeRef}
                  type="text"
                  className="text-input"
                  value={rangeText}
                  placeholder="1-3, 5"
                  aria-label="Page range"
                  aria-invalid={pageChoice === "range" && !range}
                  spellCheck={false}
                  onFocus={() => setPageChoice("range")}
                  onChange={(event) => setRangeText(event.target.value)}
                />
              </div>
            </div>
            <span className="export-label">Format</span>
            <div className="export-choices">
              {(["png", "jpeg"] as const).map((format) => (
                <label key={format} className="radio">
                  <input type="radio" name="format" checked={choice.format === format} onChange={() => setChoice({ ...choice, format })} />
                  {format.toUpperCase()}
                </label>
              ))}
            </div>
            <span className="export-label">Resolution</span>
            <div className="export-choices">
              {exportResolutions.map((dpi) => (
                <label key={dpi} className="radio">
                  <input type="radio" name="resolution" checked={choice.dpi === dpi} onChange={() => setChoice({ ...choice, dpi })} />
                  {dpi} dpi
                </label>
              ))}
            </div>
            {pixels && request && (
              <p className="export-note">
                Page {request.currentPage + 1} comes out at {pixels.width} × {pixels.height} px.
              </p>
            )}
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
            <button type="submit" className="button primary" disabled={!pages.length} autoFocus>
              Export…
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
