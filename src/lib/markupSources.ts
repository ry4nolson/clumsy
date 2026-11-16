import { isClaimedShape, isMeasureKind, type Markup } from "./markup";
import { listedAnnotationTypes, rowFromAnnotation, rowFromMarkup, type AnnotationEntry, type MarkupRow } from "./markupRows";
import { isStickyNote, noteFromAnnotation, visibleNotes, type StickyNote } from "./notes";
import { isStateReply, latestStatuses, stateText } from "./reviewState";

export type AnnotationRecord = {
  id: string;
  pageIndex: number;
  annotationType: number;
  annotationFlags?: number;
  rect: ArrayLike<number>;
  color?: ArrayLike<number> | null;
  titleObj?: { str?: string } | null;
  contentsObj?: { str?: string } | null;
  richText?: { str?: string } | null;
  modificationDate?: string | null;
  creationDate?: string | null;
  inReplyTo?: string | null;
  stateModel?: string | { name?: string } | null;
  state?: string | { name?: string } | null;
  it?: string;
};

export type EditorRecord = {
  key: string;
  id?: string;
  deleted?: boolean;
  annotationType: number;
  pageIndex: number;
  rect: ArrayLike<number>;
  color?: ArrayLike<number> | null;
  value?: string;
  popup?: { contents?: string; deleted?: boolean } | null;
};

export type RowSources = {
  annotations: AnnotationRecord[];
  subjects: Record<string, string>;
  clumsy: Markup[];
  clumsyFileIds: Set<string>;
  noteChanges: StickyNote[];
  editors: EditorRecord[];
  pageLabels: string[] | null;
  author: string;
  time: (date: string | null | undefined) => number | null;
};

const HIDDEN = 2;
const NO_VIEW = 32;
const READ_ONLY = 64;
const LOCKED = 128;
const SIGNATURE_EDITOR = 101;
const STAMP = 13;
const FREETEXT = 3;

const rgb = (color: ArrayLike<number> | null | undefined) => (color && color.length >= 3 ? Array.from(color, (value) => value / 255) : null);
const textOf = (record: AnnotationRecord) => record.contentsObj?.str || record.richText?.str || "";

export function assembleRows(sources: RowSources): MarkupRow[] {
  const { annotations, subjects, clumsy, clumsyFileIds, noteChanges, editors, pageLabels, author, time } = sources;
  const byId = new Map(annotations.map((record) => [record.id, record]));
  const replies = annotations.filter(isStateReply).map((record) => ({ parent: record.inReplyTo!, state: stateText(record.state), time: time(record.modificationDate || record.creationDate) }));
  const statuses = latestStatuses(replies, noteChanges);
  const statusOf = (id: string) => statuses.get(id) ?? null;
  const edited = new Map(editors.filter((editor) => editor.id).map((editor) => [editor.id!, editor]));
  const rows: MarkupRow[] = [];

  for (const markup of clumsy) {
    const record = byId.get(markup.id);
    rows.push(
      rowFromMarkup(markup, pageLabels, {
        author: markup.fresh ? author : record?.titleObj?.str || "",
        comment: record && !isMeasureKind(markup.kind) ? textOf(record) : "",
        date: time(markup.date) ?? time(record?.modificationDate),
        status: statusOf(markup.id),
        source: markup.fresh ? "clumsy" : clumsyFileIds.has(markup.id) && record ? "file" : "clumsy",
      }),
    );
  }

  const fileNotes = annotations.flatMap((record) => noteFromAnnotation(record as Parameters<typeof noteFromAnnotation>[0]) ?? []);
  for (const note of visibleNotes(fileNotes, noteChanges.filter((change) => !change.reply))) {
    const record = byId.get(note.id);
    const entry: AnnotationEntry = {
      id: note.id,
      pageIndex: note.pageIndex,
      annotationType: 1,
      rect: note.rect,
      color: rgb(note.color),
      author: note.fresh ? author : record?.titleObj?.str || "",
      subject: subjects[note.id] ?? "",
      comment: note.text,
      date: time(note.date),
      readOnly: false,
      source: note.fresh ? "clumsy" : "file",
      target: "note",
    };
    rows.push(rowFromAnnotation(entry, pageLabels, statusOf(note.id)));
  }

  for (const record of annotations) {
    const flags = record.annotationFlags ?? 0;
    const editor = edited.get(record.id);
    if (
      !listedAnnotationTypes.has(record.annotationType) ||
      record.inReplyTo ||
      isStickyNote(record) ||
      clumsyFileIds.has(record.id) ||
      flags & (HIDDEN | NO_VIEW) ||
      editor?.deleted
    ) {
      continue;
    }
    const entry: AnnotationEntry = {
      id: record.id,
      pageIndex: record.pageIndex,
      annotationType: record.annotationType,
      rect: Array.from(editor?.rect ?? record.rect),
      color: rgb(editor?.color ?? record.color),
      author: record.titleObj?.str || "",
      subject: subjects[record.id] ?? "",
      comment: editor?.popup && !editor.popup.deleted ? (editor.popup.contents ?? "") : editor?.annotationType === FREETEXT ? (editor.value ?? "") : textOf(record),
      date: time(record.modificationDate || record.creationDate),
      readOnly: isClaimedShape(record) || !!(flags & (READ_ONLY | LOCKED)),
      source: editor ? "editor" : "file",
      target: "annotation",
    };
    rows.push(rowFromAnnotation(entry, pageLabels, statusOf(record.id)));
  }

  for (const editor of editors) {
    if (editor.id || editor.deleted) {
      continue;
    }
    const entry: AnnotationEntry = {
      id: editor.key,
      pageIndex: editor.pageIndex,
      annotationType: editor.annotationType === SIGNATURE_EDITOR ? STAMP : editor.annotationType,
      rect: Array.from(editor.rect),
      color: rgb(editor.color),
      author: "",
      subject: "",
      comment: editor.annotationType === FREETEXT ? (editor.value ?? "") : (editor.popup?.contents ?? ""),
      date: null,
      readOnly: false,
      source: "editor",
      target: "annotation",
    };
    rows.push(rowFromAnnotation(entry, pageLabels, null));
  }

  return rows;
}
