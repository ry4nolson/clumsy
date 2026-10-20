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
