export type CompressLevelId = "high" | "balanced" | "small";

export type CompressLevel = { id: CompressLevelId; label: string; hint: string; dpi: number; quality: number };

export type CompressSettings = Pick<CompressLevel, "dpi" | "quality">;

export type CompressProgress = { done: number; total: number };

export const compressLevels: CompressLevel[] = [
  { id: "high", label: "High quality", hint: "Images at 200 dpi. Still good for printing.", dpi: 200, quality: 0.82 },
  { id: "balanced", label: "Balanced", hint: "Images at 150 dpi. Good for email and reading on screen.", dpi: 150, quality: 0.7 },
  { id: "small", label: "Smallest", hint: "Images at 96 dpi. Small print in scans may be hard to read.", dpi: 96, quality: 0.5 },
];

export const DEFAULT_COMPRESS_LEVEL: CompressLevelId = "balanced";

export const compressLevel = (id: unknown) => compressLevels.find((level) => level.id === id) ?? compressLevels[1];

export const MIN_IMAGE_BYTES = 16 * 1024;
export const MAX_IMAGE_PIXELS = 100_000_000;
const KEEP_RATIO = 0.9;
const WORTH_RATIO = 0.98;
const RESAMPLE_MARGIN = 1.15;

export type Size = { width: number; height: number };

export function targetSize(image: Size, drawn: Size | null, dpi: number): Size {
  if (!drawn || drawn.width <= 0 || drawn.height <= 0) {
    return image;
  }
  const needed = Math.max((drawn.width / 72) * dpi / image.width, (drawn.height / 72) * dpi / image.height);
  if (needed * RESAMPLE_MARGIN >= 1) {
    return image;
  }
  return { width: Math.max(1, Math.round(image.width * needed)), height: Math.max(1, Math.round(image.height * needed)) };
}

export const worthReplacing = (before: number, after: number) => after < before * KEEP_RATIO;

export const worthApplying = (before: number, after: number) => after < before * WORTH_RATIO;

export function formatBytes(bytes: number) {
  if (bytes < 1000) {
    return `${bytes} bytes`;
  }
  if (bytes < 999_500) {
    return `${Math.round(bytes / 1000)} KB`;
  }
  const megabytes = bytes / 1_000_000;
  return `${megabytes < 99.95 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

export function savingLabel(before: number, after: number) {
  const percent = Math.round((1 - after / before) * 100);
  return `${formatBytes(before)} → ${formatBytes(after)}, ${percent}% smaller`;
}
