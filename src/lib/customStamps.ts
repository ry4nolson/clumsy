import { winAnsiSafe } from "./winAnsi";

export const CUSTOM_PREFIX = "custom:";
export const CUSTOM_STAMPS_KEY = "clumsy.customStamps";
export const MAX_CUSTOM_STAMPS = 50;
export const MAX_LIBRARY_CHARS = 2_000_000;
export const MAX_IMAGE_CHARS = 600_000;
export const MAX_TEXT_LENGTH = 40;
export const MAX_NAME_LENGTH = 80;

export type TextStamp = { id: string; name: string; kind: "text"; text: string; color: number[]; date: boolean };
export type ImageStamp = { id: string; name: string; kind: "image"; mime: "image/png" | "image/jpeg"; data: string; width: number; height: number };
export type CustomStamp = TextStamp | ImageStamp;

type Store = Pick<Storage, "getItem" | "setItem">;

export const isCustomId = (id: string) => id.startsWith(CUSTOM_PREFIX);

export const newCustomId = () => `${CUSTOM_PREFIX}${crypto.randomUUID()}`;

const isColor = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === "number" && part >= 0 && part <= 1);

const isSize = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 4096;

export const cleanText = (text: string) => winAnsiSafe(text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH));

export const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);

export function parseCustomStamp(value: unknown): CustomStamp | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || !isCustomId(raw.id) || !/^[\w:-]+$/.test(raw.id) || typeof raw.name !== "string") {
    return null;
  }
  const name = cleanName(raw.name);
  if (raw.kind === "text" && typeof raw.text === "string" && cleanText(raw.text) && isColor(raw.color)) {
    return { id: raw.id, name: name || cleanText(raw.text), kind: "text", text: cleanText(raw.text), color: raw.color, date: raw.date === true };
  }
  if (
    raw.kind === "image" &&
    (raw.mime === "image/png" || raw.mime === "image/jpeg") &&
    typeof raw.data === "string" &&
    raw.data.length > 0 &&
    raw.data.length <= MAX_IMAGE_CHARS &&
    /^[A-Za-z0-9+/]+=*$/.test(raw.data) &&
    raw.data.startsWith(raw.mime === "image/png" ? "iVBORw0KGgo" : "/9j/") &&
    isSize(raw.width) &&
    isSize(raw.height)
  ) {
    return { id: raw.id, name: name || "Image", kind: "image", mime: raw.mime, data: raw.data, width: raw.width, height: raw.height };
  }
  return null;
}

export function parseLibrary(text: string | null): CustomStamp[] {
  if (!text) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(text);
    const seen = new Set<string>();
    const stamps = Array.isArray(parsed) ? parsed.map(parseCustomStamp) : [];
    return stamps.filter((stamp): stamp is CustomStamp => !!stamp && !seen.has(stamp.id) && !!seen.add(stamp.id)).slice(0, MAX_CUSTOM_STAMPS);
  } catch {
    return [];
  }
}

export type LibraryRefusal = "count" | "size";

export function libraryProblem(list: CustomStamp[]): LibraryRefusal | null {
  if (list.length > MAX_CUSTOM_STAMPS) {
    return "count";
  }
  return JSON.stringify(list).length > MAX_LIBRARY_CHARS ? "size" : null;
}

export const refusalMessage = (problem: LibraryRefusal | "storage") =>
  problem === "count"
    ? `You can keep up to ${MAX_CUSTOM_STAMPS} custom stamps. Delete one to add another.`
    : "There isn't room for this stamp. Delete some custom stamps, or use a smaller image.";

export function readLibrary(store?: Pick<Storage, "getItem">) {
  try {
    return parseLibrary((store ?? localStorage).getItem(CUSTOM_STAMPS_KEY));
  } catch {
    return [];
  }
}

export function writeLibrary(list: CustomStamp[], store?: Store): LibraryRefusal | "storage" | null {
  const problem = libraryProblem(list);
  if (problem) {
    return problem;
  }
  try {
    (store ?? localStorage).setItem(CUSTOM_STAMPS_KEY, JSON.stringify(list));
    return null;
  } catch {
    return "storage";
  }
}

export const renamedStamp = (list: CustomStamp[], id: string, name: string) =>
  list.map((stamp) => (stamp.id === id && cleanName(name) ? { ...stamp, name: cleanName(name) } : stamp));

export const withoutStamp = (list: CustomStamp[], id: string) => list.filter((stamp) => stamp.id !== id);

const registry = new Map<string, CustomStamp>();
let library = new Set<string>();

export function registerStamps(stamps: Iterable<CustomStamp>, replace = false) {
  for (const stamp of stamps) {
    if (replace || !registry.has(stamp.id)) {
      registry.set(stamp.id, stamp);
    }
  }
}

export function setLibrary(stamps: CustomStamp[]) {
  registerStamps(stamps, true);
  library = new Set(stamps.map((stamp) => stamp.id));
}

export const customStamp = (id: string) => registry.get(id) ?? null;

export const knownStampIds = () => [...registry.keys()];

export const inLibrary = (id: string) => library.has(id);

export const libraryStamps = () => [...library].flatMap((id) => registry.get(id) ?? []);

export function stampsFor(markup: Iterable<{ stamp?: string | null }>) {
  const found = new Map<string, CustomStamp>();
  for (const { stamp } of markup) {
    const custom = stamp && isCustomId(stamp) ? registry.get(stamp) : undefined;
    if (custom) {
      found.set(custom.id, custom);
    }
  }
  return [...found.values()];
}

export const imageHref = (stamp: ImageStamp) => `data:${stamp.mime};base64,${stamp.data}`;

export function fitSize(width: number, height: number, longest: number, enlarge: boolean) {
  const scale = Math.min(longest / Math.max(width, height), enlarge ? Infinity : 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const nameFromFile = (fileName: string) => cleanName(fileName.replace(/\.[^.]+$/, "")) || "Image";
