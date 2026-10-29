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
