import { useEffect, useRef, useState } from "react";
import { useCustomStamps } from "../hooks/useCustomStamps";
import { readRecentStamps } from "../lib/markupParams";
import { ELECTRICAL_CATEGORIES, isKnownStamp, searchStamps } from "../lib/stampSymbols";
import { CustomStampForm } from "./CustomStampForm";
import { CustomStampSection } from "./CustomStampSection";
import { StampButton } from "./StampButton";
import "./Markup.css";

export type StampPickerProps = { open: boolean; color: string; onPick: (id: string) => void; onClose: () => void };

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

const nothingFound = { custom: [], review: [], icons: [], electrical: [] };

export function StampPicker({ open, color, onPick, onClose }: StampPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);
  const custom = useCustomStamps();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      setQuery("");
      setComposing(false);
      setRecent(readRecentStamps());
      dialog.showModal();
    } else if (!open && dialog?.open) {
      if (document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      dialog.close();
    }
  }, [open]);

  const found = open ? searchStamps(query) : nothingFound;
  const searching = query.trim() !== "";
  const nothing = !found.custom.length && !found.review.length && !found.icons.length && !found.electrical.length;

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet info-sheet stamp-picker"
      aria-label="Stamps"
      onCancel={(event) => {
        event.preventDefault();
        if (composing) {
          setComposing(false);
        } else {
          onClose();
        }
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
          disabled={composing}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="stamp-body">
        {composing ? (
          <CustomStampForm
            onAdd={(stamp) => {
              if (custom.add(stamp)) {
                onPick(stamp.id);
              }
            }}
            onCancel={() => setComposing(false)}
          />
        ) : (
          <>
            {open && !searching && <Section title="Recently Used" ids={recent.filter(isKnownStamp)} color={color} onPick={onPick} />}
            {open && <CustomStampSection found={found.custom} searching={searching} color={color} api={custom} onPick={onPick} onNewText={() => setComposing(true)} />}
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
            {open && searching && nothing && <p className="stamp-empty">No stamps match “{query.trim()}”.</p>}
          </>
        )}
      </div>
      <p className="stamp-hint">Click the page to place a stamp, or drag to size it.</p>
    </dialog>
  );
}
