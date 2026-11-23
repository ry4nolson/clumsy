export type OverlayPair = { previous: number | null; current: number | null };

export type PairChoices = Array<number | null>;

const labelKey = (label: string) => label.trim().toLowerCase();

export function choicesByNumber(previousCount: number, currentCount: number): PairChoices {
  return Array.from({ length: previousCount }, (_, index) => (index < currentCount ? index : null));
}

export function choicesByLabel(previousLabels: string[], currentLabels: string[]): PairChoices {
  const waiting = new Map<string, number[]>();
  currentLabels.forEach((label, index) => {
    const key = labelKey(label);
    waiting.set(key, [...(waiting.get(key) ?? []), index]);
  });
  return previousLabels.map((label) => waiting.get(labelKey(label))?.shift() ?? null);
}

export function withChoice(choices: PairChoices, row: number, current: number | null): PairChoices {
  return choices.map((choice, index) => (index === row ? current : current !== null && choice === current ? null : choice));
}

export function pairsFrom(choices: PairChoices, currentCount: number): OverlayPair[] {
  const valid = choices.map((choice) => (choice !== null && choice >= 0 && choice < currentCount ? choice : null));
  const used = new Set(valid.filter((choice): choice is number => choice !== null));
  const paired: OverlayPair[] = [];
  const removed: OverlayPair[] = [];
  valid.forEach((current, previous) => (current === null ? removed : paired).push({ previous, current }));
  const added = Array.from({ length: currentCount }, (_, current) => current)
    .filter((current) => !used.has(current))
    .map((current) => ({ previous: null, current }));
  return [...paired, ...removed, ...added];
}

export const unpairedCurrent = (choices: PairChoices, currentCount: number) =>
  pairsFrom(choices, currentCount).flatMap((pair) => (pair.previous === null && pair.current !== null ? [pair.current] : []));

export function overlayLabel(pair: OverlayPair, previousLabels: string[], currentLabels: string[]) {
  if (pair.current === null) {
    return `${previousLabels[pair.previous ?? 0] ?? ""} (removed)`;
  }
  return `${currentLabels[pair.current] ?? ""} (${pair.previous === null ? "added" : "overlay"})`;
}

export const sheetLabels = (labels: string[] | null | undefined, count: number) => Array.from({ length: count }, (_, index) => labels?.[index]?.trim() || String(index + 1));

const withoutPdf = (name: string) => name.replace(/\.pdf$/i, "") || name;

export const overlayName = (previousName: string, currentName: string) => `${withoutPdf(previousName)} vs ${withoutPdf(currentName)}.pdf`;
