import { colorFromHex, hexColor, shapeKinds, type Markup, type MarkupStyle, type ShapeKind } from "./markup";
import { isKnownStamp } from "./stampSymbols";

export const MARKUP_PARAMS_KEY = "clumsy.markupParams";
export const RECENT_STAMPS_KEY = "clumsy.recentStamps";
export const MAX_RECENT_STAMPS = 8;

export type TextMode = "highlight" | "underline" | "strikeout";

export type MarkupParams = { color: string; fill: boolean; width: number; opacity: number; shape: ShapeKind; textMode: TextMode };

export const markupColors = ["#e5484d", "#f76b15", "#2e7d32", "#1565c0", "#000000"];

export const defaultMarkupParams: MarkupParams = { color: markupColors[0], fill: false, width: 2, opacity: 1, shape: "rectangle", textMode: "highlight" };

type Store = Pick<Storage, "getItem" | "setItem">;

const storage = (store?: Store) => store ?? localStorage;

export function cleanMarkupParams(value: unknown): MarkupParams {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof MarkupParams, unknown>>;
  const number = (input: unknown, min: number, max: number, fallback: number) => (typeof input === "number" && input >= min && input <= max ? input : fallback);
  return {
    color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : defaultMarkupParams.color,
    fill: raw.fill === true,
    width: number(raw.width, 0.5, 12, defaultMarkupParams.width),
    opacity: number(raw.opacity, 0.1, 1, defaultMarkupParams.opacity),
    shape: shapeKinds.includes(raw.shape as ShapeKind) ? (raw.shape as ShapeKind) : defaultMarkupParams.shape,
    textMode: raw.textMode === "underline" || raw.textMode === "strikeout" ? raw.textMode : "highlight",
  };
}

export function readMarkupParams(store?: Store) {
  try {
    return cleanMarkupParams(JSON.parse(storage(store).getItem(MARKUP_PARAMS_KEY) ?? "null"));
  } catch {
    return defaultMarkupParams;
  }
}

export const styleOf = (params: MarkupParams): MarkupStyle => ({ color: colorFromHex(params.color), fill: params.fill, width: params.width, opacity: params.opacity });

export const paramsOfMarkup = (params: MarkupParams, markup: Markup): MarkupParams => ({
  ...params,
  color: hexColor(markup.color),
  fill: markup.fill !== null,
  width: markup.width || params.width,
  opacity: markup.opacity,
});

export function readRecentStamps(store?: Store): string[] {
  try {
    const value: unknown = JSON.parse(storage(store).getItem(RECENT_STAMPS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && isKnownStamp(id)).slice(0, MAX_RECENT_STAMPS) : [];
  } catch {
    return [];
  }
}

export function rememberStamp(id: string, store?: Store) {
  const recent = [id, ...readRecentStamps(store).filter((entry) => entry !== id)].slice(0, MAX_RECENT_STAMPS);
  try {
    storage(store).setItem(RECENT_STAMPS_KEY, JSON.stringify(recent));
  } catch {
    return recent;
  }
  return recent;
}
