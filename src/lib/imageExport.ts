export type ExportFormat = "png" | "jpeg";

export const exportResolutions = [72, 150, 300] as const;

export type ExportResolution = (typeof exportResolutions)[number];

export type ExportOptions = { format: ExportFormat; dpi: ExportResolution; quality: number };

export const defaultExportOptions: ExportOptions = { format: "png", dpi: 150, quality: 0.9 };

export const MAX_CANVAS_PIXELS = 2 ** 25;
export const MAX_CANVAS_SIDE = 16384;

export function normalizeExportOptions(value: unknown): ExportOptions {
  const stored = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof ExportOptions, unknown>>;
  const format = stored.format === "jpeg" ? "jpeg" : stored.format === "png" ? "png" : defaultExportOptions.format;
  const dpi = exportResolutions.find((candidate) => candidate === stored.dpi) ?? defaultExportOptions.dpi;
  const quality = typeof stored.quality === "number" && Number.isFinite(stored.quality) ? Math.min(1, Math.max(0.5, stored.quality)) : defaultExportOptions.quality;
  return { format, dpi, quality };
}

export const extensionFor = (format: ExportFormat) => (format === "jpeg" ? "jpg" : "png");

export const mimeTypeFor = (format: ExportFormat) => (format === "jpeg" ? "image/jpeg" : "image/png");

export function safeFileName(name: string) {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, "-")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return cleaned || "Untitled";
}

export function exportBaseName(documentName: string) {
  return safeFileName(documentName.replace(/\.pdf$/i, ""));
}

export function pageImageName(documentName: string, page: number, format: ExportFormat, padTo?: number) {
  const number = String(page + 1).padStart(padTo === undefined ? 0 : String(padTo).length, "0");
  return `${exportBaseName(documentName)} - page ${number}.${extensionFor(format)}`;
}

export function pageImageNames(documentName: string, pages: number[], pageCount: number, format: ExportFormat) {
  if (pages.length === 1) {
    return [pageImageName(documentName, pages[0], format)];
  }
  return pages.map((page) => pageImageName(documentName, page, format, pageCount));
}

export function exportTargets(selection: number[], pageCount: number) {
  const pages = [...new Set(selection)].filter((page) => page >= 0 && page < pageCount).sort((a, b) => a - b);
  return pages.length ? pages : Array.from({ length: pageCount }, (_, page) => page);
}

export function renderScale(width: number, height: number, dpi: number, maxPixels = MAX_CANVAS_PIXELS, maxSide = MAX_CANVAS_SIDE) {
  const wanted = dpi / 72;
  const byArea = Math.sqrt(maxPixels / (width * height));
  const bySide = maxSide / Math.max(width, height);
  return Math.min(wanted, byArea, bySide);
}
