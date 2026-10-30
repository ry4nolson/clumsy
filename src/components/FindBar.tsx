import { useEffect, useRef, useState } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, Regex, WholeWord, X } from "lucide-react";
import type { FindQuery, FindStatus, FindType } from "../hooks/usePdfViewer";
import { escapeFindPattern, isInvalidFindPattern } from "../lib/findPattern";

type FindBarProps = {
  status: FindStatus;
  focusToken: number;
  seed: string | null;
  onFind: (query: FindQuery, type: FindType, findPrevious?: boolean) => void;
  onClose: () => void;
};

export function FindBar({ status, focusToken, seed, onFind, onClose }: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState<FindQuery>({ query: "", caseSensitive: false, entireWord: false, matchDiacritics: false, regex: false });

  useEffect(() => {
    if (seed) {
      setQuery((current) => {
        const next = { ...current, query: current.regex ? escapeFindPattern(seed) : seed };
        onFind(next, "");
        return next;
      });
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  const update = (next: FindQuery, type: Exclude<FindType, "again">) => {
    setQuery(next);
    onFind(next, type);
  };

  const step = (findPrevious: boolean) => {
    if (query.query) {
      onFind(query, "again", findPrevious);
    }
  };

  const invalid = isInvalidFindPattern(query.query, query.regex, query.caseSensitive);
  const summary = !query.query
    ? ""
    : invalid
      ? "Invalid regex"
      : status.state === "notFound"
        ? "No matches"
        : status.total
          ? `${status.current} of ${status.total}`
          : "";

  return (
    <div className="findbar" role="search">
      <input
        ref={inputRef}
        className={(status.state === "notFound" || invalid) && query.query ? "not-found" : undefined}
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
      <button
        type="button"
        className="icon-button diacritics-toggle"
        aria-pressed={query.matchDiacritics}
        onClick={() => update({ ...query, matchDiacritics: !query.matchDiacritics }, "diacriticmatchingchange")}
        title="Match diacritics"
        aria-label="Match diacritics"
      >
        <span aria-hidden="true">é</span>
      </button>
      <button
        type="button"
        className="icon-button"
        aria-pressed={query.regex}
        onClick={() => update({ ...query, regex: !query.regex }, "")}
        title="Use regular expression"
      >
        <Regex size={18} />
      </button>
      <button type="button" className="icon-button" onClick={onClose} title="Close (Esc)">
        <X size={16} />
      </button>
    </div>
  );
}
