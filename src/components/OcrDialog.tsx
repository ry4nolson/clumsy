import { useEffect, useRef, useState } from "react";
import type { OcrOptions, OcrRequest, OcrStatus } from "../hooks/useOcr";
import { pagesToExport, type PageChoice } from "../lib/imageExport";
import { downloadNote, ocrLanguage, ocrLanguages } from "../lib/ocr";
import { formatPageRange, parsePageRange } from "../lib/pageRanges";
import { ProgressView } from "./ProgressView";

type OcrDialogProps = {
  request: OcrRequest | null;
  status: OcrStatus;
  options: OcrOptions;
  needsDownload: boolean;
  onLanguage: (language: string) => void;
  onStart: (options: OcrOptions, pages: number[]) => void;
  onClose: () => void;
};

const TITLE = "Recognize Text (OCR)";

function Outcome({ status, onClose }: { status: Exclude<OcrStatus, { kind: "choosing" | "working" }>; onClose: () => void }) {
  const waiting = status.kind === "downloading" || status.kind === "finishing";
  return (
    <>
      <h2>{TITLE}</h2>
      <p className="dialog-hint" role="status">
        {status.kind === "downloading" && `Downloading ${status.language} language data…`}
        {status.kind === "finishing" && "Adding the text to the pages…"}
        {status.kind === "done" && status.summary}
        {status.kind === "failed" && `Couldn't recognize the text. ${status.message}`}
      </p>
      {waiting && <progress className="export-progress" />}
      <div className="dialog-actions">
        <span className="spacer" />
        <button type="button" className={waiting ? "button" : "button primary"} onClick={onClose} autoFocus>
          {waiting ? "Cancel" : "Done"}
        </button>
      </div>
    </>
  );
}

export function OcrDialog({ request, status, options, needsDownload, onLanguage, onStart, onClose }: OcrDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const [choice, setChoice] = useState(options);
  const [pageChoice, setPageChoice] = useState<PageChoice>("all");
  const [rangeText, setRangeText] = useState("");
  const selection = request?.selection ?? [];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request) {
      setChoice(options);
      setPageChoice(selection.length ? "selected" : "all");
      setRangeText(formatPageRange(selection.length ? selection : [request.currentPage]));
    }
    if (request && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  const range = request ? parsePageRange(rangeText, request.pageCount) : null;
  const pages = request ? pagesToExport(pageChoice, { pageCount: request.pageCount, currentPage: request.currentPage, selection, range }) : [];

  const pageOption = (value: PageChoice, label: string) => (
    <label className="radio">
      <input
        type="radio"
        name="ocr-pages"
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
        onClose();
      }}
    >
      {status.kind === "working" ? (
        <ProgressView title="Recognizing Text" note="This runs on your computer. Nothing is uploaded." progress={status.progress} onStop={onClose} />
      ) : status.kind !== "choosing" ? (
        <Outcome status={status} onClose={onClose} />
      ) : (
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            if (pages.length) {
              onStart(choice, pages);
            }
          }}
        >
          <h2>{TITLE}</h2>
          <p className="dialog-hint">
            Reads the text in scanned pages of “{request?.name}” so you can search, select, and copy it. The pages look the same, it runs on your computer, and nothing is written until you save.
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
              <label className="radio">
                <input type="checkbox" checked={choice.skipText} onChange={(event) => setChoice({ ...choice, skipText: event.target.checked })} />
                Leave text that's already there alone
              </label>
            </div>
            <label className="export-label" htmlFor="ocr-language">
              Language
            </label>
            <div className="export-choices stacked">
              <select
                id="ocr-language"
                value={choice.language}
                onChange={(event) => {
                  setChoice({ ...choice, language: event.target.value });
                  onLanguage(event.target.value);
                }}
              >
                {ocrLanguages.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              {needsDownload && <p className="export-note">{downloadNote(ocrLanguage(choice.language))}</p>}
            </div>
          </div>
          <div className="dialog-actions">
            <span className="spacer" />
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={!pages.length} autoFocus>
              Recognize
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
