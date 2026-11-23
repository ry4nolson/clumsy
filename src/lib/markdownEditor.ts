import { history, defaultKeymap, historyKeymap, redo, undo, cursorDocStart, cursorDocEnd } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorSelection, EditorState, StateEffect, StateField, type ChangeSet, type Range } from "@codemirror/state";
import { Decoration, EditorView, keymap, type DecorationSet } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { TextMatch } from "./textFind";

export type DiffLine = { from: number; className: string };

export type DiffMarks = { lines: DiffLine[]; text: Array<{ from: number; to: number }> };

export type MarkdownEditor = {
  view: EditorView;
  text: () => string;
  setText: (text: string) => void;
  lineAtTop: () => number;
  visibleLines: () => [number, number];
  scrollBy: (delta: number) => void;
  scrollToLine: (line: number) => void;
  setTopLine: (line: number) => number;
  setDiff: (marks: DiffMarks | null) => void;
  subscribe: (listener: (changes: ChangeSet | null) => void) => () => void;
  placeCursorAtLine: (line: number) => void;
  setMatches: (matches: TextMatch[], current: number) => void;
  revealMatch: (match: TextMatch) => void;
  offsetAtTop: () => number;
  undo: () => boolean;
  redo: () => boolean;
  toEdge: (top: boolean) => void;
  focus: () => void;
  hasFocus: () => boolean;
  measure: () => void;
  destroy: () => void;
};

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600", color: "var(--bone)" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--ember-text)" },
  { tag: [tags.monospace], color: "var(--md-code-text)" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator, tags.labelName], color: "var(--ash)" },
  { tag: tags.quote, color: "var(--ash)" },
]);

const setMatchesEffect = StateEffect.define<{ matches: TextMatch[]; current: number }>();

const matchMark = Decoration.mark({ class: "find-match" });
const currentMark = Decoration.mark({ class: "find-match current" });

const matchField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setMatchesEffect)) {
        const ranges: Range<Decoration>[] = effect.value.matches.map((match, index) =>
          (index === effect.value.current ? currentMark : matchMark).range(match.start, match.end),
        );
        next = Decoration.set(ranges, true);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const setDiffEffect = StateEffect.define<DiffMarks | null>();

const diffText = Decoration.mark({ class: "diff-text" });

const diffField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setDiffEffect)) {
        const marks = effect.value;
        next = marks
          ? Decoration.set(
              [...marks.lines.map((line) => Decoration.line({ class: line.className }).range(line.from)), ...marks.text.map((range) => diffText.range(range.from, range.to))],
              true,
            )
          : Decoration.none;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const tint = (color: string, amount: number) => `color-mix(in srgb, var(--diff-${color}) ${amount}%, transparent)`;

const diffTheme = Object.fromEntries(
  ["added", "removed", "modified"].flatMap((kind) => [
    [`.diff-line.${kind}`, { background: tint(kind, 13) }],
    [`.diff-line.${kind} .diff-text`, { background: tint(kind, 30), borderRadius: "2px" }],
    [`.diff-gap.${kind}`, { boxShadow: `inset 0 2px var(--diff-${kind})` }],
    [`.diff-gap.after.${kind}`, { boxShadow: `inset 0 -2px var(--diff-${kind})` }],
    [`.diff-line.${kind}.diff-current`, { boxShadow: `inset 3px 0 var(--diff-${kind})` }],
    [`.diff-gap.${kind}.diff-current`, { boxShadow: `inset 0 2px var(--diff-${kind}), inset 3px 0 var(--diff-${kind})` }],
    [`.diff-gap.after.${kind}.diff-current`, { boxShadow: `inset 0 -2px var(--diff-${kind}), inset 3px 0 var(--diff-${kind})` }],
  ]),
);

const theme = EditorView.theme({
  ...diffTheme,
  "&": { height: "100%", fontSize: "var(--md-source-size, 13px)", background: "transparent", color: "var(--bone)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: "1.6", scrollbarGutter: "stable" },
  ".cm-content": { padding: "24px 0 40vh", maxWidth: "860px", margin: "0 auto", caretColor: "var(--bone)" },
  ".cm-line": { padding: "0 32px" },
  ".cm-cursor": { borderLeftColor: "var(--bone)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { background: "var(--md-selection)" },
});

function topOffset(view: EditorView) {
  return view.scrollDOM.getBoundingClientRect().top - view.documentTop;
}

export function createMarkdownEditor(parent: HTMLElement, text: string, onChange: (text: string) => void): MarkdownEditor {
  const listeners = new Set<(changes: ChangeSet | null) => void>();
  const changed = (changes: ChangeSet | null) => listeners.forEach((listener) => listener(changes));
  let alive = true;
  const extensions = [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown(),
    syntaxHighlighting(highlightStyle),
    EditorView.lineWrapping,
    matchField,
    diffField,
    theme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
        changed(update.changes);
      }
    }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ doc: text, extensions }) });

  const lineStart = (line: number) => {
    const doc = view.state.doc;
    const number = Math.min(Math.max(Math.floor(line) + 1, 1), doc.lines);
    return { pos: doc.line(number).from, fraction: Math.floor(line) + 1 > doc.lines ? 1 : line - Math.floor(line) };
  };

  const setTopLine = (line: number) => {
    const { pos, fraction } = lineStart(line);
    const block = view.lineBlockAt(pos);
    view.scrollDOM.scrollTop += block.top + fraction * block.height - topOffset(view);
    return view.scrollDOM.scrollTop;
  };

  const scrollToLine = (line: number) => {
    const apply = () => setTopLine(line);
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  };

  const lineAtHeight = (offset: number) => {
    const height = Math.max(0, offset);
    const block = view.lineBlockAtHeight(height);
    const line = view.state.doc.lineAt(block.from).number - 1;
    return line + (block.height ? Math.min(Math.max((height - block.top) / block.height, 0), 0.999) : 0);
  };

  return {
    view,
    text: () => view.state.doc.toString(),
    setText(next) {
      if (next !== view.state.doc.toString()) {
        view.setState(EditorState.create({ doc: next, extensions }));
        changed(null);
      }
    },
    lineAtTop: () => lineAtHeight(topOffset(view)),
    visibleLines: () => {
      const top = topOffset(view);
      return [lineAtHeight(top), lineAtHeight(top + view.scrollDOM.clientHeight)];
    },
    scrollBy: (delta) => view.scrollDOM.scrollBy({ top: delta }),
    offsetAtTop: () => view.lineBlockAtHeight(Math.max(0, topOffset(view))).from,
    scrollToLine,
    setTopLine,
    setDiff(marks) {
      if (alive) {
        view.dispatch({ effects: setDiffEffect.of(marks) });
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    placeCursorAtLine(line) {
      view.dispatch({ selection: EditorSelection.cursor(lineStart(Math.ceil(line - 0.001)).pos) });
    },
    setMatches(matches, current) {
      view.dispatch({ effects: setMatchesEffect.of({ matches, current }) });
    },
    revealMatch(match) {
      view.dispatch({
        selection: EditorSelection.range(match.start, match.end),
        effects: EditorView.scrollIntoView(match.start, { y: "center" }),
      });
    },
    undo: () => undo(view),
    redo: () => redo(view),
    toEdge(top) {
      (top ? cursorDocStart : cursorDocEnd)(view);
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: top ? "start" : "end" }) });
    },
    focus: () => view.contentDOM.focus({ preventScroll: true }),
    hasFocus: () => view.contentDOM.contains(document.activeElement),
    measure: () => view.requestMeasure(),
    destroy() {
      alive = false;
      listeners.clear();
      view.destroy();
    },
  };
}
