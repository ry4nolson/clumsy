export type FuzzyMatch = { score: number; indices: number[] };

const isWordStart = (text: string, index: number) => index === 0 || /[\s\-_./:()]/.test(text[index - 1]) || (/[a-z]/.test(text[index - 1]) && /[A-Z]/.test(text[index]));

export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const needle = query.replace(/\s+/g, "").toLowerCase();
  if (!needle) {
    return { score: 0, indices: [] };
  }
  const haystack = text.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let from = 0;
  for (const char of needle) {
    const index = haystack.indexOf(char, from);
    if (index === -1) {
      return null;
    }
    const previous = indices[indices.length - 1];
    score += 1;
    if (previous !== undefined && index === previous + 1) {
      score += 5;
    }
    if (isWordStart(text, index)) {
      score += 3;
    }
    indices.push(index);
    from = index + 1;
  }
  score -= indices[0] * 0.1 + text.length * 0.01;
  return { score, indices };
}

export type Ranked<T> = { item: T; match: FuzzyMatch };

export function rankItems<T>(query: string, items: T[], text: (item: T) => string, fallback?: (item: T) => string): Array<Ranked<T>> {
  const ranked: Array<Ranked<T> & { order: number }> = [];
  items.forEach((item, order) => {
    const match = fuzzyMatch(query, text(item));
    if (match) {
      ranked.push({ item, match, order });
      return;
    }
    const extra = fallback?.(item);
    const loose = extra ? fuzzyMatch(query, extra) : null;
    if (loose) {
      ranked.push({ item, match: { score: loose.score - 10, indices: [] }, order });
    }
  });
  if (query.trim()) {
    ranked.sort((a, b) => b.match.score - a.match.score || a.order - b.order);
  }
  return ranked.map(({ item, match }) => ({ item, match }));
}
