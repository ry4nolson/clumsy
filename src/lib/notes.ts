export const NOTE_KEY_PREFIX = "clumsy-note:";
export const NOTE_SIZE = 20;
export const NOTE_COLOR = [255, 214, 61];

const TEXT_ANNOTATION = 1;

export type StickyNote = {
  id: string;
  pageIndex: number;
  rect: number[];
  text: string;
  color: number[] | null;
  date: string | null;
  fresh: boolean;
  deleted: boolean;
};

type AnnotationData = {
  annotationType: number;
  id: string;
  pageIndex?: number;
  rect: ArrayLike<number>;
  contentsObj?: { str?: string } | null;
  richText?: { str?: string } | null;
  color?: ArrayLike<number> | null;
  modificationDate?: string | null;
  creationDate?: string | null;
  inReplyTo?: string | null;
  hidden?: boolean;
};

export function isStickyNote(annotation: { annotationType: number; inReplyTo?: unknown }) {
  return annotation.annotationType === TEXT_ANNOTATION && !annotation.inReplyTo;
}

export function noteFromAnnotation(annotation: AnnotationData, pageIndex = annotation.pageIndex ?? 0): StickyNote | null {
  if (!isStickyNote(annotation) || annotation.hidden) {
    return null;
  }
  return {
    id: annotation.id,
    pageIndex,
    rect: Array.from(annotation.rect),
    text: annotation.contentsObj?.str || annotation.richText?.str || "",
    color: annotation.color ? Array.from(annotation.color) : null,
    date: annotation.modificationDate || annotation.creationDate || null,
    fresh: false,
    deleted: false,
  };
}

export function notesIn(storage: Iterable<[string, unknown]>) {
  const notes: StickyNote[] = [];
  for (const [key, value] of storage) {
    if (key.startsWith(NOTE_KEY_PREFIX)) {
      notes.push(value as StickyNote);
    }
  }
  return notes;
}

export function visibleNotes(fileNotes: StickyNote[], changes: StickyNote[], pageIndex?: number) {
  const changed = new Map(changes.map((note) => [note.id, note]));
  const notes = [...fileNotes.map((note) => changed.get(note.id) ?? note), ...changes.filter((note) => note.fresh)];
  return notes.filter((note) => !note.deleted && (pageIndex === undefined || note.pageIndex === pageIndex));
}

export function newNote(id: string, pageIndex: number, [x, y]: number[], text: string, date: string): StickyNote {
  return { id, pageIndex, rect: [x, y - NOTE_SIZE, x + NOTE_SIZE, y], text, color: NOTE_COLOR, date, fresh: true, deleted: false };
}

export function changedNote(note: StickyNote, text: string | null, date: string): StickyNote | null {
  if (!text?.trim()) {
    return note.fresh ? null : { ...note, deleted: true, date };
  }
  return { ...note, text, date };
}

export function movedNote(note: StickyNote, [x, y]: number[], date: string): StickyNote {
  const [left, bottom, right, top] = note.rect;
  return { ...note, rect: [x, y - (top - bottom), x + (right - left), y], date };
}

const pad = (value: number) => String(value).padStart(2, "0");

export function pdfDate(date: Date) {
  const parts = [date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].map(pad);
  return `D:${date.getUTCFullYear()}${parts.join("")}Z`;
}
