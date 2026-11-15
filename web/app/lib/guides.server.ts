import bundledIndex from "../../content/guides.json";
import { renderGuide, type RenderedGuide } from "./guideMarkdown";
import { findGuide, parseGuideIndex, toGuideIndex } from "./guides";
import { remoteContent } from "./remote.server";

const bundledGuides = import.meta.glob<string>("../../content/guides/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const fallback = toGuideIndex(bundledIndex);
if (!fallback) throw new Error("web/content/guides.json is malformed");

export const loadGuideIndex = remoteContent("web/content/guides.json", parseGuideIndex, fallback);

const loaders = new Map<string, () => Promise<RenderedGuide | null>>();

function guideLoader(slug: string) {
  let loader = loaders.get(slug);
  if (!loader) {
    const bundled = renderGuide(bundledGuides[`../../content/guides/${slug}.md`] ?? "");
    loader = remoteContent<RenderedGuide | null>(`web/content/guides/${slug}.md`, renderGuide, bundled);
    loaders.set(slug, loader);
  }
  return loader;
}

export async function loadGuide(slug: string) {
  const place = findGuide(await loadGuideIndex(), slug);
  const body = place && (await guideLoader(place.guide.slug)());
  return place && body ? { ...place, ...body } : null;
}
