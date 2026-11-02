import { describe, expect, it } from "vitest";
import { NOTE_COLOR, NOTE_KEY_PREFIX, changedNote, isStickyNote, movedNote, newNote, noteFromAnnotation, notesIn, pdfDate, visibleNotes, type StickyNote } from "../src/lib/notes";

const fileNote = (id: string, patch: Partial<StickyNote> = {}): StickyNote => ({
  id,
  pageIndex: 0,
  rect: [100, 600, 120, 620],
  text: id,
  color: null,
  date: null,
  fresh: false,
  deleted: false,
  ...patch,
});

describe("isStickyNote", () => {
  it("takes text annotations that aren't replies", () => {
    expect(isStickyNote({ annotationType: 1 })).toBe(true);
    expect(isStickyNote({ annotationType: 1, inReplyTo: "12R" })).toBe(false);
    expect(isStickyNote({ annotationType: 9 })).toBe(false);
  });
});

describe("noteFromAnnotation", () => {
  it("reads a sticky note from pdf.js annotation data", () => {
    const note = noteFromAnnotation(
      { annotationType: 1, id: "10R", rect: [400, 650, 420, 670], contentsObj: { str: "Add the Q3 numbers" }, color: new Uint8ClampedArray([128, 204, 255]), modificationDate: "D:20261025090000Z" },
      2,
    );
    expect(note).toEqual({ id: "10R", pageIndex: 2, rect: [400, 650, 420, 670], text: "Add the Q3 numbers", color: [128, 204, 255], date: "D:20261025090000Z", fresh: false, deleted: false });
  });

  it("falls back to rich text, the creation date, and the annotation's page", () => {
    const note = noteFromAnnotation({ annotationType: 1, id: "4R", pageIndex: 3, rect: [0, 0, 20, 20], richText: { str: "Rich" }, creationDate: "D:20260101000000Z" });
    expect(note).toMatchObject({ pageIndex: 3, text: "Rich", date: "D:20260101000000Z", color: null });
  });

  it("skips hidden notes, replies, and other annotations", () => {
    expect(noteFromAnnotation({ annotationType: 1, id: "1R", rect: [0, 0, 1, 1], hidden: true })).toBeNull();
    expect(noteFromAnnotation({ annotationType: 1, id: "2R", rect: [0, 0, 1, 1], inReplyTo: "1R" })).toBeNull();
    expect(noteFromAnnotation({ annotationType: 9, id: "3R", rect: [0, 0, 1, 1] })).toBeNull();
  });
});

describe("notesIn", () => {
  it("picks the note changes out of annotation storage", () => {
    const edited = fileNote("10R", { text: "Changed" });
    const entries: Array<[string, unknown]> = [
      ["pdfjs_internal_editor_0", { annotationType: 9 }],
      [`${NOTE_KEY_PREFIX}10R`, edited],
      ["25R", "form value"],
    ];
    expect(notesIn(entries)).toEqual([edited]);
  });
});

describe("visibleNotes", () => {
  it("applies edits and deletions to the file's notes and adds new ones", () => {
    const files = [fileNote("10R"), fileNote("12R"), fileNote("14R", { pageIndex: 1 })];
    const changes = [fileNote("10R", { text: "Edited" }), fileNote("12R", { deleted: true }), fileNote("note-1", { fresh: true, text: "New" })];
    expect(visibleNotes(files, changes).map((note) => [note.id, note.text])).toEqual([
      ["10R", "Edited"],
      ["14R", "14R"],
      ["note-1", "New"],
    ]);
  });

  it("filters by page", () => {
    const files = [fileNote("10R"), fileNote("14R", { pageIndex: 1 })];
    expect(visibleNotes(files, [fileNote("note-1", { fresh: true, pageIndex: 1 })], 1).map((note) => note.id)).toEqual(["14R", "note-1"]);
  });
});

describe("newNote", () => {
  it("puts the note's top left corner at the point", () => {
    expect(newNote("note-1", 4, [100, 500], "Hi", "D:20261102000000Z")).toEqual({
      id: "note-1",
      pageIndex: 4,
      rect: [100, 480, 120, 500],
      text: "Hi",
      color: NOTE_COLOR,
      date: "D:20261102000000Z",
      fresh: true,
      deleted: false,
    });
  });
});

describe("changedNote", () => {
  const date = "D:20261102120000Z";

  it("updates the text and date", () => {
    expect(changedNote(fileNote("10R"), "New text", date)).toMatchObject({ text: "New text", date, deleted: false });
  });

  it("marks a note from the file as deleted when its text is removed", () => {
    expect(changedNote(fileNote("10R"), null, date)).toMatchObject({ id: "10R", deleted: true, date });
    expect(changedNote(fileNote("10R"), "   ", date)).toMatchObject({ deleted: true });
  });

  it("drops a new note entirely when its text is removed", () => {
    expect(changedNote(fileNote("note-1", { fresh: true }), null, date)).toBeNull();
  });
});

describe("movedNote", () => {
  it("puts the note's top left corner at the point and keeps its size", () => {
    expect(movedNote(fileNote("10R", { rect: [100, 600, 124, 620] }), [300, 400], "D:20261102120000Z")).toMatchObject({
      rect: [300, 380, 324, 400],
      text: "10R",
      date: "D:20261102120000Z",
      deleted: false,
    });
  });
});

describe("pdfDate", () => {
  it("writes a UTC PDF date", () => {
    expect(pdfDate(new Date(Date.UTC(2026, 10, 2, 9, 5, 7)))).toBe("D:20261102090507Z");
  });
});
