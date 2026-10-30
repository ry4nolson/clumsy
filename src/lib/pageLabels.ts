export type LabelStyle = "D" | "R" | "r" | "A" | "a";
export type LabelRange = { start: number; style: LabelStyle | null; prefix: string; first: number };

const romanDigits: Array<[number, string]> = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

function toRoman(value: number) {
  let rest = value;
  let text = "";
  for (const [amount, digits] of romanDigits) {
    while (rest >= amount) {
      text += digits;
      rest -= amount;
    }
  }
  return text;
}

function fromRoman(text: string) {
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let total = 0;
  for (let index = 0; index < text.length; index++) {
    const value = values[text[index]];
    const next = values[text[index + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
}

const toLetters = (value: number) => String.fromCharCode(97 + ((value - 1) % 26)).repeat(Math.floor((value - 1) / 26) + 1);
const fromLetters = (text: string) => (text.length - 1) * 26 + text.charCodeAt(0) - 96;

export function formatNumber(style: LabelStyle, value: number) {
  switch (style) {
    case "D":
      return String(value);
    case "R":
      return toRoman(value).toUpperCase();
    case "r":
      return toRoman(value);
    case "A":
      return toLetters(value).toUpperCase();
    case "a":
      return toLetters(value);
  }
}

export function rangeLabel(range: LabelRange, offset: number) {
  return range.style ? `${range.prefix}${formatNumber(range.style, range.first + offset)}` : range.prefix;
}

const parsers: Array<[LabelStyle, RegExp, (digits: string) => number]> = [
  ["D", /^(.*?)([1-9]\d*)$/s, Number],
  ["r", /^(.*?)([ivxlcdm]+)$/s, fromRoman],
  ["R", /^(.*?)([IVXLCDM]+)$/s, (digits) => fromRoman(digits.toLowerCase())],
  ["a", /^(.*?)(([a-z])\3*)$/s, fromLetters],
  ["A", /^(.*?)(([A-Z])\3*)$/s, (digits) => fromLetters(digits.toLowerCase())],
];

function candidates(label: string, start: number): LabelRange[] {
  return parsers.flatMap(([style, pattern, parse]) => {
    const match = pattern.exec(label);
    if (!match) {
      return [];
    }
    const range = { start, style, prefix: match[1], first: parse(match[2]) };
    return range.first >= 1 && rangeLabel(range, 0) === label ? [range] : [];
  });
}

export function encodePageLabels(labels: string[]): LabelRange[] {
  const ranges: LabelRange[] = [];
  labels.forEach((label, index) => {
    const current = ranges.at(-1);
    if (current && rangeLabel(current, index - current.start) === label) {
      return;
    }
    const next = labels[index + 1];
    const numbered = next === undefined ? undefined : candidates(label, index).find((range) => rangeLabel(range, 1) === next);
    ranges.push(numbered ?? { start: index, style: null, prefix: label, first: 1 });
  });
  return ranges;
}

export function labelsFromRanges(ranges: LabelRange[], count: number) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  return Array.from({ length: count }, (_, index) => {
    const range = sorted.findLast((candidate) => candidate.start <= index);
    return range ? rangeLabel(range, index - range.start) : "";
  });
}

export type LabelNumbering = Omit<LabelRange, "start">;

export function numberingAt(labels: string[] | null | undefined, index: number): LabelNumbering {
  const range = labels ? encodePageLabels(labels).findLast((candidate) => candidate.start <= index) : null;
  if (!range) {
    return { style: "D", prefix: "", first: index + 1 };
  }
  return { style: range.style, prefix: range.prefix, first: range.style ? range.first + index - range.start : 1 };
}

export function runEnd(labels: string[] | null | undefined, index: number, count: number) {
  const next = labels ? encodePageLabels(labels).find((range) => range.start > index) : undefined;
  return next ? next.start - 1 : count - 1;
}

export function relabelRange(labels: string[] | null | undefined, count: number, from: number, to: number, numbering: LabelNumbering): string[] | null {
  const range = { start: from, ...numbering };
  const next = Array.from({ length: count }, (_, index) =>
    index >= from && index <= to ? rangeLabel(range, index - from) : (labels?.[index] ?? String(index + 1)),
  );
  return hasCustomLabels(next) ? next : null;
}

export function hasCustomLabels(labels: string[] | null | undefined): labels is string[] {
  return !!labels?.some((label, index) => label !== String(index + 1));
}

export function pageLabelOf(labels: string[] | null | undefined, page: number) {
  return labels?.[page - 1] || String(page);
}

export function pageFromInput(input: string, labels: string[] | null | undefined, count: number): number | null {
  const text = input.trim();
  if (!text || count < 1) {
    return null;
  }
  const exact = labels?.indexOf(text) ?? -1;
  if (exact >= 0) {
    return exact + 1;
  }
  const lower = text.toLowerCase();
  const loose = labels?.findIndex((label) => label.toLowerCase() === lower) ?? -1;
  if (loose >= 0) {
    return loose + 1;
  }
  if (/^\d+$/.test(text)) {
    return Math.min(Math.max(1, Number(text)), count);
  }
  return null;
}
