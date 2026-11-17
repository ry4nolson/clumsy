import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString } from "@cantoo/pdf-lib";
import type { StickyNote } from "../src/lib/notes";
import { newMarkup } from "../src/lib/markup";
import { writeAnnotations, writeStickyNotes } from "../src/lib/notesPdf";
import { sectionAt } from "../src/lib/protection";

async function makePdf(pageCount = 2, useObjectStreams = false) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index++) {
    doc.addPage([612, 792]);
  }
  const { context } = doc;
  const popup = context.obj({ Type: "Annot", Subtype: "Popup", Rect: [320, 500, 520, 600], Open: false });
  const popupRef = context.register(popup);
  const noteRef = context.register(
    context.obj({ Type: "Annot", Subtype: "Text", Rect: [400, 650, 420, 670], Name: "Comment", Contents: PDFString.of("Old"), RC: PDFString.of("<body>Old</body>"), Popup: popupRef }),
  );
  popup.set(PDFName.of("Parent"), noteRef);
  doc.getPage(0).node.set(PDFName.of("Annots"), context.obj([noteRef, popupRef]));
  return { bytes: await doc.save({ useObjectStreams }), noteId: `${noteRef.objectNumber}R`, popupRef };
}

async function annotations(bytes: Uint8Array, pageIndex = 0) {
  const doc = await PDFDocument.load(bytes);
  const annots = doc.getPage(pageIndex).node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  return (annots?.asArray() ?? []).map((ref) => ({ ref: ref as PDFRef, dict: doc.context.lookup(ref, PDFDict) }));
}

const text = (dict: PDFDict, key: string) => dict.lookupMaybe(PDFName.of(key), PDFString, PDFHexString)?.decodeText();

const lastStartxref = (bytes: Uint8Array) => Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(Buffer.from(bytes).toString("latin1"))?.[1]);

const note = (patch: Partial<StickyNote>): StickyNote => ({
  id: "note-1",
  pageIndex: 0,
  rect: [100, 480, 120, 500],
  text: "New note ✓",
  color: [255, 214, 61],
  date: "D:20261102090507Z",
  fresh: true,
  deleted: false,
  ...patch,
});

describe("writeStickyNotes", () => {
  it("leaves the file alone when nothing changed", async () => {
    const { bytes } = await makePdf();
    expect(await writeStickyNotes(bytes, [])).toBe(bytes);
  });

  it("adds a new note with its popup as an incremental update", async () => {
    const { bytes } = await makePdf();
    const saved = await writeStickyNotes(bytes, [note({ pageIndex: 1 })]);
    expect(Buffer.from(saved.slice(0, bytes.length)).equals(Buffer.from(bytes))).toBe(true);
    const [added, popup] = await annotations(saved, 1);
    expect(added.dict.get(PDFName.of("Subtype"))).toBe(PDFName.of("Text"));
    expect(text(added.dict, "Contents")).toBe("New note ✓");
    expect(text(added.dict, "M")).toBe("D:20261102090507Z");
    expect(added.dict.lookup(PDFName.of("F"), PDFNumber).asNumber()).toBe(28);
    expect(added.dict.lookup(PDFName.of("Rect"), PDFArray).asArray().map((value) => (value as PDFNumber).asNumber())).toEqual([100, 480, 120, 500]);
    expect(added.dict.get(PDFName.of("Popup"))).toBe(popup.ref);
    expect(popup.dict.get(PDFName.of("Parent"))).toBe(added.ref);
  });

  it("edits a note from the file and drops its stale rich text", async () => {
    const { bytes, noteId } = await makePdf();
    const saved = await writeStickyNotes(bytes, [note({ id: noteId, fresh: false, text: "Edited" })]);
    const [edited] = await annotations(saved);
    expect(text(edited.dict, "Contents")).toBe("Edited");
    expect(text(edited.dict, "M")).toBe("D:20261102090507Z");
    expect(edited.dict.has(PDFName.of("RC"))).toBe(false);
  });

  it("moves a note from the file and its popup without touching its text", async () => {
    const { bytes, noteId } = await makePdf();
    const saved = await writeStickyNotes(bytes, [note({ id: noteId, fresh: false, text: "Old", rect: [100, 680, 120, 700] })]);
    const [moved, popup] = await annotations(saved);
    const rect = (dict: PDFDict) => dict.lookup(PDFName.of("Rect"), PDFArray).asArray().map((value) => (value as PDFNumber).asNumber());
    expect(rect(moved.dict)).toEqual([100, 680, 120, 700]);
    expect(rect(popup.dict)).toEqual([20, 530, 220, 630]);
    expect(text(moved.dict, "Contents")).toBe("Old");
    expect(moved.dict.has(PDFName.of("RC"))).toBe(true);
    expect(text(moved.dict, "M")).toBe("D:20261102090507Z");
  });

  it("removes a deleted note and its popup from the page", async () => {
    const { bytes, noteId } = await makePdf();
    const saved = await writeStickyNotes(bytes, [note({ id: noteId, fresh: false, deleted: true })]);
    expect(await annotations(saved)).toEqual([]);
  });

  it("skips new notes that were deleted and notes it can't find", async () => {
    const { bytes } = await makePdf();
    const saved = await writeStickyNotes(bytes, [note({ deleted: true }), note({ id: "999R", fresh: false, text: "Gone" }), note({ pageIndex: 7 })]);
    expect((await annotations(saved)).length).toBe(2);
  });

  it("writes notes into password-protected files as a plain rewrite", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.encrypt({ userPassword: "secret", ownerPassword: "owner" });
    const locked = await doc.save();
    await expect(writeStickyNotes(locked, [note({})])).rejects.toThrow(/password didn't work/);
    const saved = await writeStickyNotes(locked, [note({ text: "Inside (a) \\ secret ✓" })], "secret");
    const [added] = await annotations(saved);
    expect(text(added.dict, "Contents")).toBe("Inside (a) \\ secret ✓");
    expect((await PDFDocument.load(saved)).isEncrypted).toBe(false);
  });

  it("writes notes into owner-only files", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.encrypt({ ownerPassword: "owner", permissions: { printing: false } });
    const [added] = await annotations(await writeStickyNotes(await doc.save(), [note({})]));
    expect(text(added.dict, "Contents")).toBe("New note ✓");
  });

  it.each([
    ["table", false],
    ["stream", true],
  ] as const)("keeps a cross-reference %s when appending to one", async (kind, useObjectStreams) => {
    const { bytes } = await makePdf(2, useObjectStreams);
    const start = lastStartxref(bytes);
    expect(sectionAt(bytes, start)).toBe(kind);
    const rectangle = newMarkup({ id: "markup-rect", pageIndex: 0, kind: "rectangle", box: [100, 500, 220, 580] }, { color: [1, 0, 0], fill: false, width: 2, opacity: 1 }, "D:20261116120000Z");
    const once = await writeAnnotations(bytes, [note({ pageIndex: 1 })], [rectangle]);
    expect(Buffer.from(once.subarray(0, bytes.length)).equals(Buffer.from(bytes))).toBe(true);
    expect(sectionAt(once, lastStartxref(once))).toBe(kind);
    expect(Buffer.from(once.subarray(bytes.length)).toString("latin1")).toMatch(new RegExp(`/Prev ${start}\\b`));
    const twice = await writeAnnotations(once, [note({ id: "note-2" })], []);
    expect(sectionAt(twice, lastStartxref(twice))).toBe(kind);
    expect((await annotations(twice, 0)).map(({ dict }) => dict.lookup(PDFName.of("Subtype"), PDFName).decodeText())).toEqual(["Text", "Popup", "Square", "Text", "Popup"]);
    expect(await annotations(twice, 1)).toHaveLength(2);
  });
});
