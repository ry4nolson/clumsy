export type Feature = { title: string; items: string[] };
export type Shortcut = { keys: string[]; label: string; note: string };
export type SiteContent = { features: Feature[]; shortcuts: Shortcut[] };

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(isText);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isFeature = (value: unknown): value is Feature =>
  isRecord(value) && isText(value.title) && isTextList(value.items);

const isShortcut = (value: unknown): value is Shortcut =>
  isRecord(value) && isTextList(value.keys) && isText(value.label) && isText(value.note);

export function toSiteContent(value: unknown): SiteContent | null {
  if (!isRecord(value)) return null;
  const { features, shortcuts } = value;
  if (!Array.isArray(features) || !features.length || !features.every(isFeature)) return null;
  if (!Array.isArray(shortcuts) || !shortcuts.length || !shortcuts.every(isShortcut)) return null;
  return {
    features: features.map(({ title, items }) => ({ title, items })),
    shortcuts: shortcuts.map(({ keys, label, note }) => ({ keys, label, note })),
  };
}

export function parseSiteContent(text: string) {
  try {
    return toSiteContent(JSON.parse(text));
  } catch {
    return null;
  }
}
