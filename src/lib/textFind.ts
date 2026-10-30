import { compileFindPattern, escapeFindPattern, findPatternMatches } from "./findPattern";

export type TextQuery = { query: string; caseSensitive: boolean; entireWord: boolean; matchDiacritics: boolean; regex: boolean };

export type TextMatch = { start: number; end: number };

function decompose(text: string) {
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < text.length; ) {
    const char = String.fromCodePoint(text.codePointAt(index)!);
    const next = index + char.length;
    const parts = char.normalize("NFD");
    normalized += parts;
    for (let unit = 0; unit < parts.length; unit++) {
      starts.push(index);
      ends.push(next);
    }
    index = next;
  }
  return { normalized, starts, ends };
}

export function findInText(text: string, query: TextQuery): TextMatch[] {
  const pattern = compileFindPattern(query.regex ? query.query : escapeFindPattern(query.query), query.caseSensitive, query.matchDiacritics);
  if (!pattern || !text) {
    return [];
  }
  const { normalized, starts, ends } = decompose(text);
  return findPatternMatches(pattern, normalized, query.entireWord, query.matchDiacritics).map(({ index, length }) => ({
    start: starts[index],
    end: ends[index + length - 1],
  }));
}

export function matchNear(matches: TextMatch[], offset: number) {
  const index = matches.findIndex((match) => match.end > offset);
  return index < 0 ? 0 : index;
}

export function stepMatch(current: number, count: number, previous: boolean) {
  if (!count) {
    return -1;
  }
  return (current + (previous ? -1 : 1) + count) % count;
}
