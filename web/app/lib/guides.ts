import { SHOTS, type ShotId } from "./content";

export type GuideEntry = { slug: string; title: string; summary: string; image?: ShotId; imageAlt?: string };
export type GuideGroup = { title: string; guides: GuideEntry[] };
export type GuideIndex = { groups: GuideGroup[] };
export type GuideLink = Pick<GuideEntry, "slug" | "title">;
export type GuidePlace = { guide: GuideEntry; group: string; previous: GuideLink | null; next: GuideLink | null };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isShot = (value: unknown): value is ShotId => typeof value === "string" && Object.hasOwn(SHOTS, value);

function toEntry(value: unknown): GuideEntry | null {
  if (!isRecord(value) || !isText(value.slug) || !SLUG.test(value.slug) || !isText(value.title) || !isText(value.summary)) {
    return null;
  }
  const { slug, title, summary, image, imageAlt } = value;
  return isShot(image) && isText(imageAlt) ? { slug, title, summary, image, imageAlt } : { slug, title, summary };
}

function toGroup(value: unknown): GuideGroup | null {
  if (!isRecord(value) || !isText(value.title) || !Array.isArray(value.guides) || !value.guides.length) return null;
  const guides = value.guides.map(toEntry);
  return guides.every((guide) => guide !== null) ? { title: value.title, guides } : null;
}

export function toGuideIndex(value: unknown): GuideIndex | null {
  if (!isRecord(value) || !Array.isArray(value.groups) || !value.groups.length) return null;
  const groups = value.groups.map(toGroup);
  if (!groups.every((group) => group !== null)) return null;
  const slugs = groups.flatMap((group) => group.guides.map((guide) => guide.slug));
  return new Set(slugs).size === slugs.length ? { groups } : null;
}

export function parseGuideIndex(text: string) {
  try {
    return toGuideIndex(JSON.parse(text));
  } catch {
    return null;
  }
}

export function findGuide(index: GuideIndex, slug: string): GuidePlace | null {
  const all = index.groups.flatMap((group) => group.guides.map((guide) => ({ guide, group: group.title })));
  const at = all.findIndex((entry) => entry.guide.slug === slug);
  if (at < 0) return null;
  const link = (entry?: { guide: GuideEntry }) => (entry ? { slug: entry.guide.slug, title: entry.guide.title } : null);
  return { ...all[at], previous: link(all[at - 1]), next: link(all[at + 1]) };
}
