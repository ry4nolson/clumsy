export const AUTHOR_NAME_KEY = "clumsy.authorName";

export function readAuthorName() {
  try {
    const stored = JSON.parse(localStorage.getItem(AUTHOR_NAME_KEY) ?? '""');
    return typeof stored === "string" ? stored.trim() : "";
  } catch {
    return "";
  }
}

type Authored = { fresh: boolean; author?: string | null };

export function withAuthor<N extends Authored, M extends Authored>(notes: N[], markup: M[]) {
  const author = readAuthorName() || null;
  const sign = <T extends Authored>(entry: T): T => (entry.fresh && !entry.author ? { ...entry, author } : entry);
  return { notes: notes.map(sign), markup: markup.map(sign) };
}
