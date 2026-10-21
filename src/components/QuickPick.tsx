import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { rankItems } from "../lib/fuzzy";
import type { QuickPickItem } from "../lib/quickPick";
import "./QuickPick.css";

export type QuickPickMode = { key: string; placeholder: string; items: QuickPickItem[]; empty: string };

type QuickPickProps = {
  mode: QuickPickMode | null;
  onPick: (id: string) => void;
  onClose: () => void;
};

function highlight(text: string, indices: number[]) {
  if (!indices.length) {
    return text;
  }
  const marked = new Set(indices);
  const parts: ReactNode[] = [];
  let run = "";
  let runMarked = false;
  const flush = (index: number) => {
    if (run) {
      parts.push(runMarked ? <mark key={index}>{run}</mark> : run);
    }
    run = "";
  };
  text.split("").forEach((char, index) => {
    if (marked.has(index) !== runMarked) {
      flush(index);
      runMarked = marked.has(index);
    }
    run += char;
  });
  flush(text.length);
  return parts;
}

export function QuickPick({ mode, onPick, onClose }: QuickPickProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const results = useMemo(() => (mode ? rankItems(query, mode.items, (item) => item.label, (item) => item.detail ?? "") : []), [mode, query]);

  const hide = () => {
    dialogRef.current?.close();
    returnFocus.current?.focus();
    returnFocus.current = null;
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (mode && dialog && !dialog.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!mode && dialog?.open) {
      hide();
    }
    setQuery("");
    setSelected(0);
  }, [mode?.key]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const finish = (id: string | null) => {
    hide();
    if (id) {
      onPick(id);
    } else {
      onClose();
    }
  };

  const move = (delta: number) => {
    if (results.length) {
      setSelected((current) => (current + delta + results.length) % results.length);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="quick-pick"
      aria-label={mode?.placeholder}
      onCancel={(event) => {
        event.preventDefault();
        finish(null);
      }}
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) {
          event.preventDefault();
        }
      }}
      onPointerDown={(event) => {
        const box = dialogRef.current?.getBoundingClientRect();
        const outside = box && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
        if (event.target === dialogRef.current && outside) {
          finish(null);
        }
      }}
    >
      <input
        className="quick-pick-input"
        autoFocus
        spellCheck={false}
        placeholder={mode?.placeholder}
        value={query}
        role="combobox"
        aria-expanded="true"
        aria-controls="quick-pick-list"
        aria-activedescendant={results.length ? `quick-pick-${selected}` : undefined}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(0);
        }}
        onKeyDown={(event) => {
          const actions: Record<string, () => void> = {
            ArrowDown: () => move(1),
            ArrowUp: () => move(-1),
            PageDown: () => setSelected((current) => Math.max(0, Math.min(results.length - 1, current + 8))),
            PageUp: () => setSelected((current) => Math.max(0, current - 8)),
            Enter: () => results[selected] && finish(results[selected].item.id),
            Escape: () => finish(null),
          };
          const action = actions[event.key];
          if (action && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
            event.preventDefault();
            event.stopPropagation();
            action();
          }
        }}
      />
      <ul ref={listRef} id="quick-pick-list" className="quick-pick-list" role="listbox">
        {results.map(({ item, match }, index) => (
          <li
            key={item.id}
            id={`quick-pick-${index}`}
            data-index={index}
            role="option"
            aria-selected={index === selected}
            className={index === selected ? "selected" : undefined}
            onPointerMove={() => setSelected(index)}
            onClick={() => finish(item.id)}
          >
            <span className="quick-pick-label">{highlight(item.label, match.indices)}</span>
            {item.detail && <span className="quick-pick-detail">{item.detail}</span>}
            {item.hint && <kbd className="quick-pick-hint">{item.hint}</kbd>}
          </li>
        ))}
        {!results.length && <li className="quick-pick-empty">{mode?.empty}</li>}
      </ul>
    </dialog>
  );
}
