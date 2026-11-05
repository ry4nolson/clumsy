import type { Change, ChangeKind } from "./comparison";

export type ChangeFilter = "all" | ChangeKind;

export type ChangeSummary = Record<ChangeKind, number> & { wordsAdded: number; wordsRemoved: number };

export function summarizeChanges(changes: Change[]): ChangeSummary {
  const summary: ChangeSummary = { added: 0, removed: 0, modified: 0, wordsAdded: 0, wordsRemoved: 0 };
  for (const change of changes) {
    summary[change.kind] += 1;
    summary.wordsRemoved += change.words.left;
    summary.wordsAdded += change.words.right;
  }
  return summary;
}

export function filteredChanges(changes: Change[], filter: ChangeFilter) {
  return changes.flatMap((change, index) => (filter === "all" || change.kind === filter ? [index] : []));
}

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

export function describeWords({ wordsAdded, wordsRemoved }: ChangeSummary) {
  return `${plural(wordsAdded, "word")} added, ${plural(wordsRemoved, "word")} removed`;
}

export const CHANGE_WINDOW = 400;

export type WindowExtra = { before: number; after: number };

export function changeWindow(count: number, focus: number, extra: WindowExtra = { before: 0, after: 0 }, size = CHANGE_WINDOW): [start: number, end: number] {
  const start = Math.max(0, Math.min(focus - Math.floor(size / 2), count - size));
  const end = Math.min(count, start + size);
  return [Math.max(0, start - extra.before), Math.min(count, end + extra.after)];
}
