export type SavedSignature = { uuid: string; description: string; signatureData: string };

export const MAX_SAVED_SIGNATURES = 5;

export const SIGNATURES_KEY = "clumsy.signatures";

export const LEGACY_SIGNATURE_KEY = "clumsy.signature";

const isSaved = (value: unknown): value is SavedSignature =>
  !!value &&
  typeof value === "object" &&
  typeof (value as SavedSignature).uuid === "string" &&
  typeof (value as SavedSignature).description === "string" &&
  typeof (value as SavedSignature).signatureData === "string";

export function parseSignatures(text: string | null): SavedSignature[] {
  if (!text) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isSaved).slice(0, MAX_SAVED_SIGNATURES) : [];
  } catch {
    return [];
  }
}

export function withSignature(list: SavedSignature[], entry: SavedSignature) {
  return list.length >= MAX_SAVED_SIGNATURES ? null : [...list, entry];
}

export function withoutSignature(list: SavedSignature[], uuid: string) {
  return list.filter((entry) => entry.uuid !== uuid);
}

export function readSignatures(storage: Pick<Storage, "getItem"> = localStorage) {
  try {
    return parseSignatures(storage.getItem(SIGNATURES_KEY));
  } catch {
    return [];
  }
}

export function writeSignatures(list: SavedSignature[], storage: Pick<Storage, "setItem"> = localStorage) {
  try {
    storage.setItem(SIGNATURES_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function readLegacySignature(storage: Pick<Storage, "getItem"> = localStorage) {
  try {
    const dataUrl = storage.getItem(LEGACY_SIGNATURE_KEY);
    return dataUrl?.startsWith("data:image/") ? dataUrl : null;
  } catch {
    return null;
  }
}

export function clearLegacySignature(storage: Pick<Storage, "removeItem"> = localStorage) {
  try {
    storage.removeItem(LEGACY_SIGNATURE_KEY);
  } catch {
    return;
  }
}
