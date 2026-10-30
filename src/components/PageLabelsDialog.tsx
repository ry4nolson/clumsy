import { useEffect, useRef, useState } from "react";
import { numberingAt, rangeLabel, relabelRange, type LabelNumbering, type LabelStyle } from "../lib/pageLabels";

export type PageLabelsRequest = { pagesCount: number; labels: string[] | null; from: number; to: number };

type PageLabelsDialogProps = {
  request: PageLabelsRequest | null;
  onApply: (from: number, to: number, numbering: LabelNumbering | null) => void;
  onClose: () => void;
};

const styleOptions: Array<[LabelStyle | "none", string]> = [
  ["D", "1, 2, 3"],
  ["R", "I, II, III"],
  ["r", "i, ii, iii"],
  ["A", "A, B, C"],
  ["a", "a, b, c"],
  ["none", "No number"],
];

const wholeNumber = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : NaN);

function previewOf(labels: string[]) {
  const shown = labels.length > 4 ? [...labels.slice(0, 3), "…", labels.at(-1)!] : labels;
  return shown.map((label) => (label === "" ? "(blank)" : label)).join(", ");
}

export function PageLabelsDialog({ request, onApply, onClose }: PageLabelsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [style, setStyle] = useState<LabelStyle | "none">("D");
  const [prefix, setPrefix] = useState("");
  const [first, setFirst] = useState("1");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog && !dialog.open) {
      const numbering = numberingAt(request.labels, request.from);
      setFrom(String(request.from + 1));
      setTo(String(request.to + 1));
      setStyle(numbering.style ?? "none");
      setPrefix(numbering.prefix);
      setFirst(String(numbering.first));
      dialog.showModal();
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  const count = request?.pagesCount ?? 0;
  const start = wholeNumber(from);
  const end = wholeNumber(to);
  const firstNumber = style === "none" ? 1 : wholeNumber(first);
  const valid = start >= 1 && end >= start && end <= count && firstNumber >= 1;
  const numbering: LabelNumbering = { style: style === "none" ? null : style, prefix, first: firstNumber };

  const result =
    request && valid
      ? {
          changed: JSON.stringify(relabelRange(request.labels, count, start - 1, end - 1, numbering)) !== JSON.stringify(request.labels),
          preview: previewOf(Array.from({ length: end - start + 1 }, (_, index) => rangeLabel({ start: 0, ...numbering }, index))),
        }
      : null;

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
          if (valid && result?.changed) {
            onApply(start - 1, end - 1, numbering);
          }
        }}
      >
        <h2>Page Labels</h2>
        <p className="dialog-hint">Labels are the page names shown in the page box and on thumbnails. Pages outside the range keep theirs.</p>
        <div className="label-form">
          <span className="label-form-name">Pages</span>
          <span className="label-form-range">
            <input
              className="text-input"
              aria-label="First page"
              inputMode="numeric"
              autoFocus
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <span>to</span>
            <input className="text-input" aria-label="Last page" inputMode="numeric" value={to} onChange={(event) => setTo(event.target.value)} />
            <span className="label-form-note">of {count}</span>
          </span>
          <label className="label-form-name" htmlFor="page-label-style">
            Style
          </label>
          <select id="page-label-style" className="text-input" value={style} onChange={(event) => setStyle(event.target.value as LabelStyle | "none")}>
            {styleOptions.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
          <label className="label-form-name" htmlFor="page-label-prefix">
            Prefix
          </label>
          <input id="page-label-prefix" className="text-input" placeholder="Optional, like A-" value={prefix} onChange={(event) => setPrefix(event.target.value)} />
          <label className="label-form-name" htmlFor="page-label-first">
            Start at
          </label>
          <input
            id="page-label-first"
            className="text-input"
            inputMode="numeric"
            disabled={style === "none"}
            value={style === "none" ? "" : first}
            onChange={(event) => setFirst(event.target.value)}
          />
          <span className="label-form-name">Preview</span>
          <output className="label-form-preview">{result ? result.preview : `Enter pages between 1 and ${count}`}</output>
        </div>
        <div className="dialog-actions">
          {request?.labels && (
            <button type="button" className="button" onClick={() => onApply(0, count - 1, null)}>
              Remove All Labels
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={!result?.changed}>
            Apply
          </button>
        </div>
      </form>
    </dialog>
  );
}
