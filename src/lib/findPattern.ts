export type PatternMatch = { index: number; length: number };

const wordCharacter = /[\p{L}\p{N}_]/u;
const combiningMark = /\p{M}/u;
const keptMarks = new Set([
  0x3099, 0x309a, 0x094d, 0x09cd, 0x0a4d, 0x0acd, 0x0b4d, 0x0bcd, 0x0c4d, 0x0ccd, 0x0d3b, 0x0d3c, 0x0d4d, 0x0dca, 0x0e3a, 0x0eba, 0x0f84, 0x1039, 0x103a, 0x1714,
  0x1734, 0x17d2, 0x1a60, 0x1b44, 0x1baa, 0x1bab, 0x1bf2, 0x1bf3, 0x2d7f, 0xa806, 0xa82c, 0xa8c4, 0xa953, 0xa9c0, 0xaaf6, 0xabed, 0x0c56, 0x0f71, 0x0f72, 0x0f7a,
  0x0f7b, 0x0f7c, 0x0f7d, 0x0f80, 0x0f74,
]);

const isDiacritic = (char: string | undefined) => !!char && combiningMark.test(char) && !keptMarks.has(char.charCodeAt(0));

function stripDiacritics(text: string) {
  let stripped = "";
  const origins: number[] = [];
  for (let index = 0; index < text.length; index++) {
    if (!isDiacritic(text[index])) {
      stripped += text[index];
      origins.push(index);
    }
  }
  origins.push(text.length);
  return { stripped, origins };
}

export function compileFindPattern(source: string, caseSensitive: boolean, matchDiacritics = false): RegExp | null {
  if (!source) {
    return null;
  }
  const decomposed = source.normalize("NFD");
  const prepared = matchDiacritics ? decomposed : stripDiacritics(decomposed).stripped;
  for (const flags of ["gu", "g"]) {
    try {
      return new RegExp(prepared, caseSensitive ? flags : `${flags}i`);
    } catch {
      continue;
    }
  }
  return null;
}

export function isInvalidFindPattern(source: string, regex: boolean, caseSensitive: boolean) {
  return regex && source !== "" && compileFindPattern(source, caseSensitive) === null;
}

export function escapeFindPattern(text: string) {
  return text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

function isWordEdge(inside: string | undefined, outside: string | undefined) {
  return !outside || !inside || !wordCharacter.test(outside) || !wordCharacter.test(inside);
}

export function findPatternMatches(pattern: RegExp, content: string, entireWord: boolean, matchDiacritics = false): PatternMatch[] {
  const { stripped, origins } = matchDiacritics ? { stripped: content, origins: null } : stripDiacritics(content);
  const matches: PatternMatch[] = [];
  for (const match of stripped.matchAll(new RegExp(pattern.source, pattern.flags))) {
    const { index } = match;
    const { length } = match[0];
    if (!length) {
      continue;
    }
    if (entireWord && !(isWordEdge(stripped[index], stripped[index - 1]) && isWordEdge(stripped[index + length - 1], stripped[index + length]))) {
      continue;
    }
    if (!origins) {
      if (!isDiacritic(content[index]) && !isDiacritic(content[index + length])) {
        matches.push({ index, length });
      }
      continue;
    }
    const start = origins[index];
    matches.push({ index: start, length: origins[index + length] - start });
  }
  return matches;
}
