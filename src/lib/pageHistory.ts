export type Version = { bytes: Uint8Array; page: number; count: number };

export const HISTORY_LIMIT = 20;
export const HISTORY_BYTES = 256 * 1024 * 1024;

export function trimHistory(versions: Version[], limit = HISTORY_LIMIT, budget = HISTORY_BYTES) {
  const kept: Version[] = [];
  let total = 0;
  for (const version of [...versions].reverse()) {
    if (kept.length && (kept.length >= limit || total + version.bytes.byteLength > budget)) {
      break;
    }
    kept.unshift(version);
    total += version.bytes.byteLength;
  }
  return kept;
}

export type History = { undo: Version[]; redo: Version[] };

const held = (history: History) => [...history.undo, ...history.redo].reduce((total, version) => total + version.bytes.byteLength, 0);

const canDrop = (history: History) => history.undo.length > 1 || history.redo.length > 0;

export function shareBudget(histories: History[], budget = HISTORY_BYTES): History[] {
  const trimmed = histories.map((history) => ({ undo: [...history.undo], redo: [...history.redo] }));
  let total = trimmed.reduce((sum, history) => sum + held(history), 0);
  while (total > budget) {
    const candidates = trimmed.filter(canDrop);
    if (!candidates.length) {
      break;
    }
    const largest = candidates.reduce((most, history) => (held(history) > held(most) ? history : most));
    const dropped = largest.undo.length > 1 ? largest.undo.shift() : largest.redo.shift();
    total -= dropped?.bytes.byteLength ?? 0;
  }
  return trimmed;
}
