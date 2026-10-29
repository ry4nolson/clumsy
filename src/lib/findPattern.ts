export type PatternMatch = { index: number; length: number };

const wordCharacter = /[\p{L}\p{N}_]/u;

export function compileFindPattern(source: string, caseSensitive: boolean): RegExp | null {
  if (!source) {
    return null;
  }
  for (const flags of ["gu", "g"]) {
    try {
      return new RegExp(source, caseSensitive ? flags : `${flags}i`);
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

export function findPatternMatches(pattern: RegExp, content: string, entireWord: boolean): PatternMatch[] {
  const matches: PatternMatch[] = [];
  for (const match of content.matchAll(new RegExp(pattern.source, pattern.flags))) {
    const { index } = match;
    const { length } = match[0];
    if (!length) {
      continue;
    }
    if (entireWord && !(isWordEdge(content[index], content[index - 1]) && isWordEdge(content[index + length - 1], content[index + length]))) {
      continue;
    }
    matches.push({ index, length });
  }
  return matches;
}
