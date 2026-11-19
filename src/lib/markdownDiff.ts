import { presentableDiff, type Change } from "@codemirror/merge";
import type { ChangeSet, Text } from "@codemirror/state";
import { otherSide, type Side } from "./comparison";
import type { DiffMarks, MarkdownEditor } from "./markdownEditor";
import { chunkKind, lineChunks, lineTotals, mapLine, placeAfterEdit, steppedIndex, type LineChunk, type LineRange, type LineTotals } from "./sourceDiff";

export type DiffStatus = LineTotals & { count: number; current: number; chunks: readonly LineChunk[] };

export type TextChunk = LineChunk & { changes: readonly Change[] };

export type SourceComparison = {
  step: (direction: 1 | -1) => void;
  setLinked: (linked: boolean) => void;
  destroy: () => void;
};

const sides: Side[] = ["left", "right"];
const CONTEXT_LINES = 3;
const NAVIGATION_PAUSE = 400;
const DIFF_DELAY = 150;
const ECHO_WINDOW = 120;

export type Anchor = { from: number; to: number; after: boolean };

export function anchorOf(doc: Text, [start, end]: LineRange): Anchor {
  if (start >= doc.lines) {
    return { from: doc.length, to: doc.length, after: true };
  }
  const from = doc.line(start + 1).from;
  return { from, to: end > start ? doc.line(end).to : from, after: false };
}

export const mapAnchor = (anchor: Anchor, changes: ChangeSet | null, doc: Text): Anchor =>
  changes
    ? { ...anchor, from: changes.mapPos(anchor.from, -1), to: changes.mapPos(anchor.to, 1) }
    : { ...anchor, from: Math.min(anchor.from, doc.length), to: Math.min(anchor.to, doc.length) };

export function anchorLines(doc: Text, anchor: Anchor): LineRange {
  if (anchor.after) {
    return [doc.lines, doc.lines];
  }
  const start = doc.lineAt(anchor.from).number - 1;
  return [start, anchor.to > anchor.from ? doc.lineAt(anchor.to).number : start];
}

const lineStart = (doc: Text, line: number) => (line < doc.lines ? doc.line(line + 1).from : doc.length);

const sliceLines = (doc: Text, [start, end]: LineRange) => doc.sliceString(doc.line(start + 1).from, doc.line(end).to);

export function buildChunks(left: Text, right: Text): TextChunk[] {
  return lineChunks(left.toJSON(), right.toJSON()).map((chunk) => ({
    ...chunk,
    changes: chunkKind(chunk) === "modified" ? presentableDiff(sliceLines(left, chunk.left), sliceLines(right, chunk.right), { scanLimit: 500, timeout: 50 }) : [],
  }));
}

export function diffMarks(chunks: readonly TextChunk[], side: Side, doc: Text, current: number): DiffMarks {
  const marks: DiffMarks = { lines: [], text: [] };
  chunks.forEach((chunk, index) => {
    const [start, end] = chunk[side];
    const kind = chunkKind(chunk);
    const suffix = `${kind}${index === current ? " diff-current" : ""}`;
    if (start === end) {
      const after = start >= doc.lines;
      marks.lines.push({ from: after ? doc.line(doc.lines).from : doc.line(start + 1).from, className: `diff-gap${after ? " after" : ""} ${suffix}` });
      return;
    }
    for (let line = start; line < end; line++) {
      marks.lines.push({ from: doc.line(line + 1).from, className: `diff-line ${suffix}` });
    }
    const base = lineStart(doc, start);
    for (const change of chunk.changes) {
      const from = base + (side === "left" ? change.fromA : change.fromB);
      const to = base + (side === "left" ? change.toA : change.toB);
      if (to > from) {
        marks.text.push({ from, to });
      }
    }
  });
  return marks;
}

export function createSourceComparison(editors: Record<Side, MarkdownEditor>, onChange: (status: DiffStatus) => void): SourceComparison {
  let chunks: TextChunk[] = [];
  let current = -1;
  let resume = 0;
  let linked = true;
  let timer = 0;
  let pausedUntil = 0;
  let anchor: Anchor | null = null;
  const drivenUntil: Record<Side, number> = { left: 0, right: 0 };
  const docOf = (side: Side) => editors[side].view.state.doc;

  const paint = () => sides.forEach((side) => editors[side].setDiff(diffMarks(chunks, side, docOf(side), current)));
  const report = () => onChange({ count: chunks.length, current, chunks, ...lineTotals(chunks) });

  const remember = () => {
    const chunk = chunks[current];
    anchor = chunk ? anchorOf(docOf("right"), chunk.right) : null;
  };

  const compute = () => {
    clearTimeout(timer);
    timer = 0;
    const placed = anchor && anchorLines(docOf("right"), anchor);
    chunks = buildChunks(docOf("left"), docOf("right"));
    if (placed) {
      ({ current, resume } = placeAfterEdit(chunks, placed));
    }
    remember();
    paint();
    report();
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(compute, DIFF_DELAY);
  };

  const follow = (from: Side) => () => {
    const now = performance.now();
    if (!linked || now < pausedUntil || now < drivenUntil[from]) {
      return;
    }
    const to = otherSide(from);
    drivenUntil[to] = now + ECHO_WINDOW;
    editors[to].setTopLine(mapLine(chunks, from, editors[from].lineAtTop()));
  };

  const edited = (side: Side) => (changes: ChangeSet | null) => {
    if (side === "right" && anchor) {
      anchor = mapAnchor(anchor, changes, docOf("right"));
    }
    schedule();
  };

  const cleanups = sides.flatMap((side) => {
    const scroller = editors[side].view.scrollDOM;
    const onScroll = follow(side);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return [editors[side].subscribe(edited(side)), () => scroller.removeEventListener("scroll", onScroll)];
  });

  compute();

  return {
    step(direction) {
      if (timer) {
        compute();
      }
      const index = steppedIndex(current, chunks.length, direction, resume);
      const chunk = chunks[index];
      if (!chunk) {
        return;
      }
      current = index;
      remember();
      pausedUntil = performance.now() + NAVIGATION_PAUSE;
      paint();
      sides.forEach((side) => editors[side].scrollToLine(Math.max(chunk[side][0] - CONTEXT_LINES, 0)));
      report();
    },
    setLinked(next) {
      linked = next;
    },
    destroy() {
      clearTimeout(timer);
      cleanups.forEach((cleanup) => cleanup());
      sides.forEach((side) => editors[side].setDiff(null));
    },
  };
}
