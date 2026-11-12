import { EncryptedPDFError, PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, type PDFContext } from "@cantoo/pdf-lib";
import type { Markup } from "./markup";
import { applyMarkup, refFromId, removeAnnotation } from "./markupPdf";
import type { StickyNote } from "./notes";
import { installDecryptedStrings, loadDecrypting } from "./pdfDecrypt";
import { collectGarbage, pageLeafRefs } from "./pdfStructure";
import { hasEncryptEntry } from "./protection";

installDecryptedStrings();

const POPUP_WIDTH = 180;
const POPUP_HEIGHT = 100;
const NOTE_FLAGS = 28;

export class NoteSaveError extends Error {}

const annotsOf = (context: PDFContext, page: PDFDict) => {
  const annots = page.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) {
    return annots;
  }
  const created = context.obj([]);
  page.set(PDFName.of("Annots"), created);
  return created;
};

function addNote(context: PDFContext, pageRef: PDFRef, page: PDFDict, note: StickyNote) {
  const [, , right, top] = note.rect;
  const date = PDFString.of(note.date ?? "");
  const popup = context.obj({ Type: "Annot", Subtype: "Popup", Rect: [right + 4, top - POPUP_HEIGHT, right + 4 + POPUP_WIDTH, top], Open: false });
  const popupRef = context.register(popup);
  const noteRef = context.register(
    context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: note.rect,
      Name: "Comment",
      F: NOTE_FLAGS,
      C: (note.color ?? []).map((value) => value / 255),
      Contents: PDFHexString.fromText(note.text),
      CreationDate: date,
      M: date,
      P: pageRef,
      Popup: popupRef,
    }),
  );
  popup.set(PDFName.of("Parent"), noteRef);
  const annots = annotsOf(context, page);
  annots.push(noteRef);
  annots.push(popupRef);
}

const rectOf = (dict: PDFDict | undefined) => {
  const array = dict?.lookupMaybe(PDFName.of("Rect"), PDFArray);
  const values = array?.asArray().map((_, index) => array.lookupMaybe(index, PDFNumber)?.asNumber());
  if (values?.length !== 4 || values.some((value) => value === undefined)) {
    return null;
  }
  const [x1, y1, x2, y2] = values as number[];
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
};

function moveNote(context: PDFContext, note: PDFDict, rect: number[]) {
  const before = rectOf(note);
  if (before?.every((value, index) => value === rect[index])) {
    return;
  }
  note.set(PDFName.of("Rect"), context.obj(rect));
  const popup = note.lookupMaybe(PDFName.of("Popup"), PDFDict);
  const popupRect = rectOf(popup);
  if (before && popup && popupRect) {
    const [dx, dy] = [rect[0] - before[0], rect[3] - before[3]];
    popup.set(PDFName.of("Rect"), context.obj(popupRect.map((value, index) => value + (index % 2 ? dy : dx))));
  }
}

function updateNote(context: PDFContext, note: PDFDict, { text, date, rect }: StickyNote) {
  if (note.lookupMaybe(PDFName.of("Contents"), PDFString, PDFHexString)?.decodeText() !== text) {
    note.set(PDFName.of("Contents"), PDFHexString.fromText(text));
    note.delete(PDFName.of("RC"));
  }
  moveNote(context, note, rect);
  if (date) {
    note.set(PDFName.of("M"), PDFString.of(date));
  }
}

async function loadForUpdate(bytes: Uint8Array, forIncrementalUpdate: boolean, password?: string) {
  try {
    return await loadDecrypting(bytes, { forIncrementalUpdate, updateMetadata: false, password });
  } catch (error) {
    if (error instanceof EncryptedPDFError || (error instanceof Error && /^(NEEDS PASSWORD|Password incorrect)/.test(error.message))) {
      throw new NoteSaveError("Comments and markup couldn't be saved because this PDF's password didn't work.");
    }
    throw error;
  }
}

async function loadForNotes(bytes: Uint8Array, password: string) {
  const decrypting = async () => ({ doc: await loadForUpdate(bytes, false, password), incremental: false, decrypted: true });
  if (hasEncryptEntry(bytes) === true) {
    return decrypting();
  }
  try {
    const appendable = await loadForUpdate(bytes, true);
    return { doc: appendable, incremental: hasXrefAt(bytes, appendable.context.pdfFileDetails.prevStartXRef), decrypted: false };
  } catch (error) {
    if (!(error instanceof NoteSaveError)) {
      throw error;
    }
    return decrypting();
  }
}

const latin1 = new TextDecoder("latin1");

export function hasXrefAt(bytes: Uint8Array, offset: number) {
  return offset > 0 && offset < bytes.length && /^\s*(xref|\d+\s+\d+\s+obj\b)/.test(latin1.decode(bytes.subarray(offset, offset + 40)));
}

export async function writeAnnotations(bytes: Uint8Array, notes: StickyNote[], markup: Markup[], password = "") {
  if (!notes.length && !markup.length) {
    return bytes;
  }
  const loaded = await loadForNotes(bytes, password);
  const { incremental, decrypted } = loaded;
  const doc = incremental || decrypted ? loaded.doc : await loadForUpdate(bytes, false);
  const { context } = doc;
  const pages = pageLeafRefs(doc);
  for (const note of notes) {
    const pageRef = pages[note.pageIndex];
    const page = pageRef && context.lookupMaybe(pageRef, PDFDict);
    if (!page) {
      continue;
    }
    if (note.fresh) {
      if (!note.deleted) {
        addNote(context, pageRef, page, note);
      }
      continue;
    }
    const ref = refFromId(note.id);
    const existing = ref && context.lookupMaybe(ref, PDFDict);
    if (!existing) {
      continue;
    }
    if (note.deleted) {
      removeAnnotation(context, page, ref, existing);
    } else {
      updateNote(context, existing, note);
    }
  }
  applyMarkup(doc, markup, pages);
  if (incremental) {
    return doc.commit();
  }
  if (decrypted) {
    collectGarbage(doc);
  }
  return doc.save({ addDefaultPage: false, updateFieldAppearances: false });
}

export const writeStickyNotes = (bytes: Uint8Array, notes: StickyNote[], password = "") => writeAnnotations(bytes, notes, [], password);
