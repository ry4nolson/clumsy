export type LinkTarget =
  | { kind: "anchor"; id: string }
  | { kind: "external"; url: string }
  | { kind: "file"; path: string; anchor: string | null }
  | { kind: "ignored" };

const external = /^(https?|mailto):/i;
const scheme = /^[a-z][a-z0-9+.-]*:/i;
const openable = /\.(md|markdown|pdf)$/i;

function decode(text: string) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function classifyHref(href: string | null): LinkTarget {
  const value = href?.trim() ?? "";
  if (!value) {
    return { kind: "ignored" };
  }
  if (value.startsWith("#")) {
    return value.length > 1 ? { kind: "anchor", id: decode(value.slice(1)) } : { kind: "ignored" };
  }
  if (external.test(value)) {
    return { kind: "external", url: value };
  }
  if (scheme.test(value) || value.startsWith("//")) {
    return { kind: "ignored" };
  }
  const [withoutHash, hash] = value.split(/#(.*)/s, 2);
  const path = decode(withoutHash.split("?")[0]);
  return openable.test(path) ? { kind: "file", path, anchor: hash ? decode(hash) : null } : { kind: "ignored" };
}

export function isLocalImage(src: string | null) {
  const value = src?.trim() ?? "";
  return !!value && !scheme.test(value) && !value.startsWith("//") && !value.startsWith("#");
}

export function localImagePath(src: string) {
  return decode(src.trim().split(/[?#]/)[0]);
}
