import { markerRect, mergeLineRects, sameLine, type PageRect } from "./diffRects";
import { tokenPage, type Token } from "./diffTokens";
import { slideToLineStarts, type Segment } from "./textDiff";

export type Side = "left" | "right";
export type ChangeKind = "added" | "removed" | "modified";
export type Change = { kind: ChangeKind; before: string; after: string; left: PageRect[]; right: PageRect[] };
export type Anchor = Record<Side, PageRect>;
export type PageNote = "added" | "removed" | "noText" | null;
export type Comparison = { changes: Change[]; anchors: Anchor[]; notes: Record<Side, PageNote[]> };

export type OverlayRect = PageRect & { kind: ChangeKind; marker: boolean; change: number };
export type PageOverlay = { rects: OverlayRect[]; note: PageNote };

const SNIPPET_LENGTH = 80;

export const otherSide = (side: Side): Side => (side === "left" ? "right" : "left");

function snippet(tokens: Token[]) {
  const text = tokens.map((token) => token.text).join(" ");
  return text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH - 1)}…` : text;
}

function changedRects(tokens: Token[], start: number, end: number) {
  if (start === end) {
    const marker = markerRect(tokens[start - 1]?.rects.at(-1), tokens[start]?.rects[0]);
    return marker ? [marker] : [];
  }
  return mergeLineRects(tokens.slice(start, end).flatMap((token) => token.rects));
}

function pageNotes(tokens: Token[], wholly: Uint8Array, pages: number, note: PageNote): PageNote[] {
  const total = new Array<number>(pages).fill(0);
  const changed = new Array<number>(pages).fill(0);
  tokens.forEach((token, index) => {
    const page = tokenPage(token);
    total[page] += 1;
    changed[page] += wholly[index];
  });
  return total.map((count, page) => (count === 0 ? "noText" : changed[page] === count ? note : null));
}

const lineStarts = (tokens: Token[]) =>
  tokens.map((token, index) => index === 0 || !token.rects[0] || !tokens[index - 1].rects.at(-1) || !sameLine(tokens[index - 1].rects.at(-1)!, token.rects[0]));

const words = (tokens: Token[]) => tokens.map((token) => token.text);

export function buildComparison(left: Token[], right: Token[], diff: Segment[], pages: Record<Side, number>): Comparison {
  const segments = slideToLineStarts(diff, words(left), words(right), { left: lineStarts(left), right: lineStarts(right) });
  const changes: Change[] = [];
  const anchors: Anchor[] = [];
  const removed = new Uint8Array(left.length);
  const added = new Uint8Array(right.length);
  for (const { equal, left: [leftStart, leftEnd], right: [rightStart, rightEnd] } of segments) {
    if (equal) {
      let last: Anchor | null = null;
      for (let offset = 0; offset < leftEnd - leftStart; offset++) {
        const from = left[leftStart + offset].rects[0];
        const to = right[rightStart + offset].rects[0];
        if (from && to && !(last && sameLine(last.left, from) && sameLine(last.right, to))) {
          last = { left: from, right: to };
          anchors.push(last);
        }
      }
      continue;
    }
    const kind: ChangeKind = leftStart === leftEnd ? "added" : rightStart === rightEnd ? "removed" : "modified";
    if (kind === "removed") {
      removed.fill(1, leftStart, leftEnd);
    } else if (kind === "added") {
      added.fill(1, rightStart, rightEnd);
    }
    changes.push({
      kind,
      before: snippet(left.slice(leftStart, leftEnd)),
      after: snippet(right.slice(rightStart, rightEnd)),
      left: changedRects(left, leftStart, leftEnd),
      right: changedRects(right, rightStart, rightEnd),
    });
  }
  return {
    changes,
    anchors,
    notes: {
      left: pageNotes(left, removed, pages.left, "removed"),
      right: pageNotes(right, added, pages.right, "added"),
    },
  };
}

export function overlaysFor(comparison: Comparison, side: Side): Map<number, PageOverlay> {
  const overlays = new Map<number, PageOverlay>();
  const pageOverlay = (page: number) => {
    let overlay = overlays.get(page);
    if (!overlay) {
      overlay = { rects: [], note: null };
      overlays.set(page, overlay);
    }
    return overlay;
  };
  comparison.changes.forEach((change, index) => {
    const marker = (change.kind === "added" && side === "left") || (change.kind === "removed" && side === "right");
    for (const rect of change[side]) {
      pageOverlay(rect.page).rects.push({ ...rect, kind: change.kind, marker, change: index });
    }
  });
  comparison.notes[side].forEach((note, page) => {
    if (note) {
      pageOverlay(page).note = note;
    }
  });
  return overlays;
}

export function changeRect(change: Change, side: Side) {
  return change[side][0] ?? null;
}
