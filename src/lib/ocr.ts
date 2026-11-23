import type { OcrWord } from "./ocrPdf";

export const OCR_DPI = 300;
export const MIN_CONFIDENCE = 0.3;
const MIN_TEXT_CHARACTERS = 12;
const TESSDATA_COMMIT = "87416418657359cb625c412a48b6e1d6d41c29bd";

export type OcrLanguage = { code: string; label: string; megabytes: number };

export const ocrLanguages: OcrLanguage[] = [
  { code: "eng", label: "English", megabytes: 4.1 },
  { code: "chi_sim", label: "Chinese (Simplified)", megabytes: 2.5 },
  { code: "chi_tra", label: "Chinese (Traditional)", megabytes: 2.4 },
  { code: "ces", label: "Czech", megabytes: 3.8 },
  { code: "dan", label: "Danish", megabytes: 2.6 },
  { code: "nld", label: "Dutch", megabytes: 6.1 },
  { code: "fin", label: "Finnish", megabytes: 7.9 },
  { code: "fra", label: "French", megabytes: 1.1 },
  { code: "deu", label: "German", megabytes: 1.5 },
  { code: "ell", label: "Greek", megabytes: 1.4 },
  { code: "hin", label: "Hindi", megabytes: 1.1 },
  { code: "hun", label: "Hungarian", megabytes: 5.3 },
  { code: "ita", label: "Italian", megabytes: 2.7 },
  { code: "jpn", label: "Japanese", megabytes: 2.5 },
  { code: "kor", label: "Korean", megabytes: 1.7 },
  { code: "nor", label: "Norwegian", megabytes: 3.6 },
  { code: "pol", label: "Polish", megabytes: 4.8 },
  { code: "por", label: "Portuguese", megabytes: 2.0 },
  { code: "ron", label: "Romanian", megabytes: 2.4 },
  { code: "rus", label: "Russian", megabytes: 3.9 },
  { code: "spa", label: "Spanish", megabytes: 2.3 },
  { code: "swe", label: "Swedish", megabytes: 4.2 },
  { code: "tha", label: "Thai", megabytes: 1.1 },
  { code: "tur", label: "Turkish", megabytes: 4.6 },
  { code: "ukr", label: "Ukrainian", megabytes: 3.8 },
  { code: "vie", label: "Vietnamese", megabytes: 0.5 },
];

export const ocrLanguage = (code: unknown) => ocrLanguages.find((language) => language.code === code) ?? ocrLanguages[0];

export const modelKey = (code: string) => `${TESSDATA_COMMIT}/${code}`;

export const modelUrl = (code: string) => `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${modelKey(code)}.traineddata`;

export const downloadNote = ({ label, megabytes }: OcrLanguage) =>
  `${label} needs a one-time download of about ${megabytes < 1 ? megabytes : Math.round(megabytes)} MB. After that it works offline.`;

export const hasText = (strings: string[]) => strings.join("").replace(/\s+/g, "").length >= MIN_TEXT_CHARACTERS;

export const PICTURE_SHARE = 0.02;
const COVERED_SHARE = 0.3;

export type Box = { left: number; top: number; right: number; bottom: number };

export function textCorners([a, b, c, d, e, f]: number[], width: number, height: number): Array<[number, number]> {
  const along = Math.hypot(a, b) || 1;
  const up = Math.hypot(c, d) || 1;
  const run: [number, number] = [(a / along) * width, (b / along) * width];
  const rise: [number, number] = [(c / up) * height, (d / up) * height];
  return [
    [e, f],
    [e + run[0], f + run[1]],
    [e + rise[0], f + rise[1]],
    [e + run[0] + rise[0], f + run[1] + rise[1]],
  ];
}

export function boxAround(points: Array<[number, number]>): Box {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

export function coveredByText(word: Box, taken: Box[]) {
  const area = (word.right - word.left) * (word.bottom - word.top);
  const shared = taken.reduce((sum, box) => {
    const width = Math.min(word.right, box.right) - Math.max(word.left, box.left);
    const height = Math.min(word.bottom, box.bottom) - Math.max(word.top, box.top);
    return width > 0 && height > 0 ? sum + width * height : sum;
  }, 0);
  return area <= 0 || shared >= area * COVERED_SHARE;
}

export function scanSamplePages(pageCount: number) {
  const last = pageCount - 1;
  return [...new Set([0, Math.floor(last / 2), last])].filter((page) => page >= 0 && page < pageCount);
}

export type RecognizedWord = { text: string; confidence: number; rect: { left: number; top: number; right: number; bottom: number }; lineEnd: boolean };

export function confidentWords(words: RecognizedWord[]): OcrWord[] {
  const kept: OcrWord[] = [];
  for (const { text, confidence, rect, lineEnd } of words) {
    if (text.trim() && confidence >= MIN_CONFIDENCE) {
      kept.push({ text: text.trim(), ...rect, lineEnd });
    } else if (lineEnd && kept.length) {
      kept[kept.length - 1] = { ...kept[kept.length - 1], lineEnd: true };
    }
  }
  return kept;
}

export type OcrTally = { recognized: number; skipped: number; empty: number };

const pages = (count: number) => (count === 1 ? "1 page" : `${count} pages`);

export function ocrSummary({ recognized, skipped, empty }: OcrTally) {
  const had = skipped ? ` ${pages(skipped)} had nothing new to read.` : "";
  const blank = empty ? ` No text was found on ${pages(empty)}.` : "";
  if (!recognized) {
    return empty ? `No text was found.${had}` : "Every page already has its text, so nothing changed.";
  }
  return `Added searchable text to ${pages(recognized)}.${had}${blank} Nothing is written until you save.`;
}
