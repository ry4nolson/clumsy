import { useEffect, useRef, useState } from "react";
import { hexColor } from "../lib/markup";
import { readRecentStamps } from "../lib/markupParams";
import { LABEL_FONT } from "../lib/markupSvg";
import { dateLabel } from "../lib/marks";
import { CAP_HEIGHT, ELECTRICAL_CATEGORIES, reviewStamp, searchStamps, stampDesign, stampLabel } from "../lib/stampSymbols";
import "./Markup.css";

export type StampPickerProps = { open: boolean; color: string; onPick: (id: string) => void; onClose: () => void };

export function StampPreview({ id, color }: { id: string; color: string }) {
  const review = reviewStamp(id);
  const design = stampDesign(id, review ? dateLabel(new Date()) : null);
  if (!design) {
    return null;
  }
  const stroke = review ? hexColor(review.color) : color;
  return (
    <svg viewBox={`0 0 ${design.width} ${design.height}`} aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      {design.shapes.map((shape, index) => (
        <path key={index} d={shape.d} fill={shape.fill ? stroke : "none"} stroke={shape.fill ? "none" : stroke} strokeWidth={shape.fill ? undefined : (shape.strokeWidth ?? design.strokeWidth)} />
      ))}
      {design.labels.map((label, index) => (
        <text key={index} x={label.x} y={label.y + (label.size * CAP_HEIGHT) / 2} fontSize={label.size} fontFamily={LABEL_FONT} fontWeight={700} textAnchor="middle" fill={stroke}>
          {label.text}
        </text>
      ))}
    </svg>
  );
}

function StampButton({ id, color, onPick }: { id: string; color: string; onPick: (id: string) => void }) {
  const label = stampLabel(id);
  return (
    <button type="button" className={`stamp-choice${reviewStamp(id) ? " review" : ""}`} title={label} aria-label={label} onClick={() => onPick(id)}>
      <StampPreview id={id} color={color} />
    </button>
  );
}

function Section({ title, ids, color, onPick }: { title: string; ids: string[]; color: string; onPick: (id: string) => void }) {
  if (!ids.length) {
    return null;
  }
  return (
    <section className="stamp-section">
      <h3>{title}</h3>
      <div className="stamp-grid">
        {ids.map((id) => (
          <StampButton key={id} id={id} color={color} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

export function StampPicker({ open, color, onPick, onClose }: StampPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      setQuery("");
      setRecent(readRecentStamps());
      dialog.showModal();
    } else if (!open && dialog?.open) {
      if (document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      dialog.close();
    }
  }, [open]);

  const found = open ? searchStamps(query) : { review: [], icons: [], electrical: [] };
  const searching = query.trim() !== "";
  const nothing = !found.review.length && !found.icons.length && !found.electrical.length;

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet info-sheet stamp-picker"
      aria-label="Stamps"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="info-sheet-header">
        <h2>Stamps</h2>
        <input
          className="text-input stamp-search"
          type="search"
          placeholder="Search stamps"
          aria-label="Search stamps"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="stamp-body">
        {open && !searching && <Section title="Recently Used" ids={recent} color={color} onPick={onPick} />}
        <Section title="Review" ids={found.review.map((entry) => entry.id)} color={color} onPick={onPick} />
        <Section title="Icons" ids={found.icons} color={color} onPick={onPick} />
        {ELECTRICAL_CATEGORIES.map((category) => (
          <Section
            key={category}
            title={`Electrical: ${category}`}
            ids={found.electrical.filter((entry) => entry.category === category).map((entry) => entry.id)}
            color={color}
            onPick={onPick}
          />
        ))}
        {open && nothing && <p className="stamp-empty">No stamps match “{query.trim()}”.</p>}
      </div>
      <p className="stamp-hint">Click the page to place a stamp, or drag to size it.</p>
    </dialog>
  );
}
