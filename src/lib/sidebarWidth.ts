export const SIDEBAR_WIDTH_KEY = "clumsy.sidebarWidth";
export const DEFAULT_SIDEBAR_WIDTH = 200;
export const MIN_SIDEBAR_WIDTH = 160;
export const MAX_SIDEBAR_WIDTH = 520;
export const MIN_DOCUMENT_WIDTH = 240;

export function clampSidebarWidth(width: number, available = Infinity) {
  const limit = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, available - MIN_DOCUMENT_WIDTH));
  return Math.round(Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), limit));
}

export function parseSidebarWidth(stored: string | null) {
  const width = stored === null ? NaN : Number(stored);
  return Number.isFinite(width) ? clampSidebarWidth(width) : DEFAULT_SIDEBAR_WIDTH;
}

export function readSidebarWidth(storage?: Pick<Storage, "getItem">) {
  try {
    return parseSidebarWidth((storage ?? localStorage).getItem(SIDEBAR_WIDTH_KEY));
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function writeSidebarWidth(width: number, storage?: Pick<Storage, "setItem">) {
  try {
    (storage ?? localStorage).setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    return;
  }
}
