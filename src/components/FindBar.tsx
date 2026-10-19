import { useEffect, useRef, useState } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, WholeWord, X } from "lucide-react";
import type { FindQuery, FindStatus } from "../hooks/usePdfViewer";

type FindBarProps = {
  status: FindStatus;
  focusToken: number;
  onFind: (query: FindQuery, type: "" | "again" | "casesensitivitychange" | "entirewordchange", findPrevious?: boolean) => void;
  onClose: () => void;
};

export function FindBar({ status, focusToken, onFind, onClose }: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<FindQuery>({ query: "", caseSensitive: false, entireWord: false });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  const update = (next: FindQuery, type: "" | "casesensitivitychange" | "entirewordchange") => {
    setQuery(next);
    onFind(next, type);
  };

  const step = (findPrevious: boolean) => {
    if (query.query) {
      onFind(query, "again", findPrevious);
    }
  };

  const summary = !query.query
    ? ""
    : status.state === "notFound"
      ? "No matches"
      : status.total
        ? `${status.current} of ${status.total}`
        : "";

  return (
    <div className="findbar" role="search">
      <input
        ref={inputRef}
        className={status.state === "notFound" && query.query ? "not-found" : undefined}
        type="search"
        placeholder="Find in document"
        value={query.query}
        onChange={(event) => update({ ...query, query: event.target.value }, "")}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            step(event.shiftKey);
          }
        }}
        spellCheck={false}
      />
      <span className="findbar-count" aria-live="polite">
        {summary}
      </span>
      <button type="button" className="icon-button" onClick={() => step(true)} title="Previous match (⇧⌘G)">
        <ChevronUp size={16} />
      </button>
      <button type="button" className="icon-button" onClick={() => step(false)} title="Next match (⌘G)">
        <ChevronDown size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-pressed={query.caseSensitive}
        onClick={() => update({ ...query, caseSensitive: !query.caseSensitive }, "casesensitivitychange")}
        title="Match case"
      >
        <CaseSensitive size={18} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-pressed={query.entireWord}
        onClick={() => update({ ...query, entireWord: !query.entireWord }, "entirewordchange")}
        title="Whole words"
      >
        <WholeWord size={18} />
      </button>
      <button type="button" className="icon-button" onClick={onClose} title="Close (Esc)">
        <X size={16} />
      </button>
    </div>
  );
}
