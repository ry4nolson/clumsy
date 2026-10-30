import { useCallback, useRef, useState, type RefObject } from "react";
import type { FindQuery, FindStatus, FindType } from "./useViewerFind";
import { clearHighlights, highlightMatches, markCurrent } from "../lib/domFind";
import { isInvalidFindPattern } from "../lib/findPattern";
import type { MarkdownEditor } from "../lib/markdownEditor";
import { offsetWithin } from "../lib/markdownDom";
import { findInText, matchNear, stepMatch, type TextMatch } from "../lib/textFind";
import type { MarkdownMode } from "../lib/tabs";

const idle: FindStatus = { state: "idle", current: 0, total: 0 };

type FindParts = {
  container: RefObject<HTMLDivElement | null>;
  content: RefObject<HTMLDivElement | null>;
  editor: RefObject<MarkdownEditor | null>;
  mode: RefObject<MarkdownMode>;
  text: RefObject<string>;
  onReveal: () => void;
};

export function useMarkdownFind({ container, content, editor, mode, text, onReveal }: FindParts) {
  const revealed = useRef(onReveal);
  revealed.current = onReveal;
  const [findOpen, setFindOpen] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [seed, setSeed] = useState<string | null>(null);
  const [status, setStatus] = useState<FindStatus>(idle);
  const query = useRef<FindQuery | null>(null);
  const marks = useRef<HTMLElement[][]>([]);
  const matches = useRef<TextMatch[]>([]);
  const current = useRef(-1);

  const count = () => (mode.current === "rendered" ? marks.current.length : matches.current.length);

  const show = useCallback(
    (reveal: boolean) => {
      const total = count();
      setStatus(total ? { state: "found", current: current.current + 1, total } : query.current?.query ? { state: "notFound", current: 0, total: 0 } : idle);
      if (mode.current === "rendered") {
        markCurrent(marks.current, current.current);
        const mark = marks.current[current.current]?.[0];
        const box = container.current;
        if (reveal && mark && box) {
          revealed.current();
          box.scrollTop = offsetWithin(box, mark) - box.clientHeight / 3;
        }
        return;
      }
      editor.current?.setMatches(matches.current, current.current);
      const match = matches.current[current.current];
      if (reveal && match) {
        editor.current?.revealMatch(match);
      }
    },
    [container, editor, mode],
  );

  const clear = useCallback(() => {
    if (content.current) {
      clearHighlights(content.current);
    }
    editor.current?.setMatches([], -1);
    marks.current = [];
    matches.current = [];
    current.current = -1;
  }, [content, editor]);

  const search = useCallback(
    (reveal: boolean) => {
      clear();
      const active = query.current;
      if (!active?.query || isInvalidFindPattern(active.query, active.regex, active.caseSensitive)) {
        setStatus(idle);
        return;
      }
      if (mode.current === "rendered") {
        const root = content.current;
        const box = container.current;
        marks.current = root ? highlightMatches(root, active) : [];
        const after = box ? marks.current.findIndex((group) => offsetWithin(box, group[0]) >= box.scrollTop) : 0;
        current.current = marks.current.length ? Math.max(after, 0) : -1;
      } else {
        matches.current = findInText(text.current, active);
        current.current = matches.current.length ? matchNear(matches.current, editor.current?.offsetAtTop() ?? 0) : -1;
      }
      show(reveal);
    },
    [clear, container, content, editor, mode, show, text],
  );

  const find = useCallback(
    (next: FindQuery, type: FindType, previous = false) => {
      query.current = next;
      if (type !== "again") {
        search(true);
        return;
      }
      if (count()) {
        current.current = stepMatch(current.current, count(), previous);
        show(true);
      }
    },
    [search, show],
  );

  const openFind = useCallback((text?: string) => {
    setSeed(text ?? null);
    setFindOpen(true);
    setFocusToken((token) => token + 1);
  }, []);

  const closeFind = useCallback(() => {
    clear();
    setStatus(idle);
    setFindOpen(false);
  }, [clear]);

  const findAgain = useCallback(
    (previous: boolean) => {
      if (query.current?.query) {
        find(query.current, "again", previous);
      } else {
        openFind();
      }
    },
    [find, openFind],
  );

  const refresh = useCallback(() => {
    if (findOpen && query.current?.query) {
      search(false);
    }
  }, [findOpen, search]);

  return { findOpen, focusToken, seed, status, find, openFind, closeFind, findAgain, refresh };
}
