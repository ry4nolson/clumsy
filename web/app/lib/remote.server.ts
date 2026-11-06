const BASE = "https://raw.githubusercontent.com/ry4nolson/clumsy/main/";
const FRESH_MS = 10 * 60_000;
const TIMEOUT_MS = 3000;

export const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=600, stale-while-revalidate=86400",
};

async function fetchText(path: string) {
  const response = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  return response?.ok ? response.text().catch(() => "") : "";
}

export function remoteContent<T>(path: string, parse: (text: string) => T | null, fallback: T) {
  let cached: { at: number; value: Promise<T> } | null = null;
  return () => {
    if (!cached || Date.now() - cached.at > FRESH_MS) {
      cached = { at: Date.now(), value: fetchText(path).then((text) => parse(text) ?? fallback) };
    }
    return cached.value;
  };
}
