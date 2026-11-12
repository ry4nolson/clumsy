import { EncryptedPDFError, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFInvalidObject, PDFName, PDFNumber, PDFRef } from "@cantoo/pdf-lib";
import { appendDssTo } from "./pdfDss";
import {
  collectFields,
  docMdpPermission,
  ensureAcroForm,
  fieldsArray,
  isSigned,
  lockOf,
  pageRotation,
  uniqueFieldName,
  widgetsOf,
  type SignField,
} from "./pdfSignFields";
import { pageLeafRefs } from "./pdfStructure";
import { hasEncryptEntry } from "./protection";
import { addSignatureAppearance } from "./signatureAppearance";
import { CONTENTS_HEX_LENGTH, type PrepareSignatureOptions, type PreparedSignature, type SignaturePlaceholder, type ValidationMaterial } from "./signatureTypes";

const key = PDFName.of;
const latin1 = new TextDecoder("latin1");
const ascii = new TextEncoder();
const PRINT_LOCKED = 4 | 128;
const SIG_FLAGS = 3;
const BYTE_RANGE_PLACEHOLDER = `[${Array(4).fill("0".repeat(10)).join(" ")}]`;

export const ENCRYPTED_MESSAGE = "Password-protected PDFs can't be signed digitally yet.";
export const DAMAGED_MESSAGE = "This PDF is damaged, so Clumsy can't add to it without rewriting it, which would break its signatures.";

type Section = "table" | "stream";

export function sectionAt(bytes: Uint8Array, offset: number): Section | null {
  if (!(offset > 0 && offset < bytes.length)) {
    return null;
  }
  const head = latin1.decode(bytes.subarray(offset, offset + 64));
  return /^\s*xref\b/.test(head) ? "table" : /^\s*\d+\s+\d+\s+obj\b/.test(head) ? "stream" : null;
}

async function loadForUpdate(bytes: Uint8Array) {
  if (hasEncryptEntry(bytes) === true) {
    throw new Error(ENCRYPTED_MESSAGE);
  }
  const doc = await PDFDocument.load(bytes, { forIncrementalUpdate: true, updateMetadata: false }).catch((error: unknown) => {
    if (error instanceof EncryptedPDFError) {
      throw new Error(ENCRYPTED_MESSAGE);
    }
    throw error;
  });
  if (doc.isEncrypted || doc.context.trailerInfo.Encrypt) {
    throw new Error(ENCRYPTED_MESSAGE);
  }
  const section = sectionAt(bytes, doc.context.pdfFileDetails.prevStartXRef);
  if (!section) {
    throw new Error(DAMAGED_MESSAGE);
  }
  return { doc, section };
}

async function commitUpdate(doc: PDFDocument, section: Section, input: Uint8Array) {
  const output = await doc.save({ useObjectStreams: section === "stream", addDefaultPage: false, updateFieldAppearances: false });
  if (output.length <= input.length || output.subarray(0, input.length).some((byte, index) => byte !== input[index])) {
    throw new Error("The signature couldn't be added as an incremental update.");
  }
  return output;
}

export function pdfDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(iso.trim());
  if (match) {
    const [, year, month, day, hour, minute, second = "00", zone] = match;
    const offset = !zone ? "" : zone === "Z" ? "Z" : `${zone.slice(0, 3)}'${zone.slice(-2)}'`;
    return `D:${year}${month}${day}${hour}${minute}${second}${offset}`;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error("The signing time isn't a valid date.");
  }
  return pdfDate(date.toISOString());
}

const textString = (text: string) => PDFHexString.fromText(text).toString();

type Lock = { action: string; fields: string[] };

const fieldMdpReference = (lock: Lock) =>
  `<< /Type /SigRef /TransformMethod /FieldMDP /TransformParams << /Type /TransformParams /Action /${lock.action}${
    lock.action === "All" ? "" : ` /Fields [${lock.fields.map(textString).join(" ")}]`
  } /V /1.2 >> >>`;

const docMdpReference = (permission: number) => `<< /Type /SigRef /TransformMethod /DocMDP /TransformParams << /Type /TransformParams /P ${permission} /V /1.2 >> >>`;

type RawSignature = { text: string; byteRangeOffset: number; contentsOffset: number };

export function signatureDictionary(entries: [string, string][]): RawSignature {
  const head = "<<\n";
  let text = head;
  let byteRangeOffset = -1;
  let contentsOffset = -1;
  for (const [name, value] of entries) {
    const line = `/${name} `;
    if (value === "byteRange") {
      byteRangeOffset = text.length + line.length;
      text += `${line}${BYTE_RANGE_PLACEHOLDER}\n`;
    } else if (value === "contents") {
      contentsOffset = text.length + line.length;
      text += `${line}<${"0".repeat(CONTENTS_HEX_LENGTH)}>\n`;
    } else {
      text += `${line}${value}\n`;
    }
  }
  return { text: `${text}>>`, byteRangeOffset, contentsOffset };
}

function locate(output: Uint8Array, inputLength: number, ref: PDFRef, raw: RawSignature): SignaturePlaceholder {
  const header = `${ref.objectNumber} ${ref.generationNumber} obj\n`;
  const update = latin1.decode(output.subarray(inputLength));
  const at = update.indexOf(`\n${header}${raw.text.slice(0, 64)}`);
  if (at < 0) {
    throw new Error("The signature placeholder couldn't be found after writing.");
  }
  const start = inputLength + at + 1 + header.length;
  if (latin1.decode(output.subarray(start, start + raw.text.length)) !== raw.text) {
    throw new Error("The signature placeholder was changed while writing.");
  }
  return {
    byteRangeAt: start + raw.byteRangeOffset,
    byteRangeLength: BYTE_RANGE_PLACEHOLDER.length,
    contentsAt: start + raw.contentsOffset,
    contentsLength: CONTENTS_HEX_LENGTH + 2,
  };
}

function registerRaw(doc: PDFDocument, raw: RawSignature) {
  return doc.context.register(PDFInvalidObject.of(ascii.encode(raw.text)));
}

function annotsOf(doc: PDFDocument, page: PDFDict) {
  const existing = page.lookupMaybe(key("Annots"), PDFArray);
  if (existing) {
    return existing;
  }
  const created = doc.context.obj([]);
  page.set(key("Annots"), created);
  return created;
}

const normalizeRect = ([x1, y1, x2, y2]: number[]) => [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];

function rectOf(dict: PDFDict) {
  const array = dict.lookupMaybe(key("Rect"), PDFArray);
  const values = array?.asArray().map((_, index) => array.lookupMaybe(index, PDFNumber)?.asNumber() ?? NaN);
  return values?.length === 4 && values.every(Number.isFinite) ? normalizeRect(values) : [0, 0, 0, 0];
}

function pageFor(doc: PDFDocument, pageNumber: number) {
  const pages = pageLeafRefs(doc);
  const ref = Number.isInteger(pageNumber) ? pages[pageNumber - 1] : undefined;
  const page = ref && doc.context.lookupMaybe(ref, PDFDict);
  if (!ref || !page) {
    throw new Error(`Page ${pageNumber} doesn't exist in this document.`);
  }
  return { ref, page };
}

function pageOfWidget(doc: PDFDocument, widget: { ref: PDFRef | undefined; dict: PDFDict }) {
  const direct = widget.dict.lookupMaybe(key("P"), PDFDict);
  if (direct) {
    return direct;
  }
  for (const ref of pageLeafRefs(doc)) {
    const page = doc.context.lookupMaybe(ref, PDFDict);
    if (widget.ref && page?.lookupMaybe(key("Annots"), PDFArray)?.asArray().some((entry) => entry === widget.ref)) {
      return page;
    }
  }
  return undefined;
}

const hasArea = (rect: number[]) => rect[2] - rect[0] > 0 && rect[3] - rect[1] > 0;

type Target = { field: PDFDict; fieldRef: PDFRef | undefined; widget: PDFDict; rect: number[]; rotation: number; name: string; existing: SignField | null };

function existingTarget(doc: PDFDocument, fields: SignField[], fieldName: string): Target {
  const field = fields.find((candidate) => candidate.name === fieldName);
  if (!field) {
    throw new Error(`There's no signature field named “${fieldName}”.`);
  }
  if (field.type !== "Sig") {
    throw new Error(`“${fieldName}” isn't a signature field.`);
  }
  if (field.value !== undefined) {
    throw new Error(`“${fieldName}” is already signed.`);
  }
  const [widget] = widgetsOf(doc, field);
  if (!widget) {
    throw new Error(`“${fieldName}” has no place on a page to sign.`);
  }
  const page = pageOfWidget(doc, widget);
  return { field: field.dict, fieldRef: field.ref, widget: widget.dict, rect: rectOf(widget.dict), rotation: page ? pageRotation(page) : 0, name: field.name, existing: field };
}

function newTarget(doc: PDFDocument, fields: SignField[], pageNumber: number, rect: number[]): Target {
  const page = pageFor(doc, pageNumber);
  const name = uniqueFieldName(fields);
  const widget = doc.context.obj({ Type: "Annot", Subtype: "Widget", FT: "Sig", T: PDFHexString.fromText(name), F: PRINT_LOCKED, Rect: rect, P: page.ref });
  const ref = doc.context.register(widget);
  annotsOf(doc, page.page).push(ref);
  fieldsArray(doc.context, ensureAcroForm(doc)).push(ref);
  return { field: widget, fieldRef: ref, widget, rect, rotation: pageRotation(page.page), name, existing: null };
}

function resolveTarget(doc: PDFDocument, fields: SignField[], target: PrepareSignatureOptions["target"]) {
  if (target.kind === "field") {
    return existingTarget(doc, fields, target.fieldName);
  }
  const rect = target.kind === "new" ? normalizeRect(target.rect) : [0, 0, 0, 0];
  if (target.kind === "new" && (!rect.every(Number.isFinite) || !hasArea(rect))) {
    throw new Error("The signature needs a rectangle with some width and height.");
  }
  return newTarget(doc, fields, target.page, rect);
}

function markSigFlags(doc: PDFDocument) {
  const form = ensureAcroForm(doc);
  const current = form.lookupMaybe(key("SigFlags"), PDFNumber)?.asNumber() ?? 0;
  form.set(key("SigFlags"), PDFNumber.of(current | SIG_FLAGS));
}

function refuseUnsignable(doc: PDFDocument, fields: SignField[], certify: boolean) {
  const permission = docMdpPermission(doc);
  if (permission === 1) {
    throw new Error("This document was certified to allow no changes, so it can't be signed.");
  }
  if (certify && (permission !== null || fields.some(isSigned))) {
    throw new Error("This document is already signed. Only the first signature can certify a document.");
  }
}

function lockFor(doc: PDFDocument, target: Target, lockField: boolean): Lock | null {
  const existing = target.existing && lockOf(target.existing);
  if (existing) {
    return existing;
  }
  if (!lockField) {
    return null;
  }
  const lock = { action: "Include", fields: [target.name] };
  target.field.set(key("Lock"), doc.context.obj({ Type: "SigFieldLock", Action: "Include", Fields: [PDFHexString.fromText(target.name)] }));
  return lock;
}

export async function prepareSignature(bytes: Uint8Array, options: PrepareSignatureOptions): Promise<PreparedSignature> {
  const { doc, section } = await loadForUpdate(bytes);
  const fields = collectFields(doc);
  refuseUnsignable(doc, fields, options.certify !== null);
  const target = resolveTarget(doc, fields, options.target);
  const lock = lockFor(doc, target, options.lockField);
  const references = [...(options.certify !== null ? [docMdpReference(options.certify)] : []), ...(lock ? [fieldMdpReference(lock)] : [])];
  const optional = (name: string, value: string | null): [string, string][] => (value ? [[name, textString(value)]] : []);
  const raw = signatureDictionary([
    ["Type", "/Sig"],
    ["Filter", "/Adobe.PPKLite"],
    ["SubFilter", "/ETSI.CAdES.detached"],
    ["ByteRange", "byteRange"],
    ["Contents", "contents"],
    ["M", `(${pdfDate(options.signingTime)})`],
    ...optional("Name", options.name),
    ...optional("Reason", options.reason),
    ...optional("Location", options.location),
    ...(references.length ? ([["Reference", `[${references.join(" ")}]`]] as [string, string][]) : []),
  ]);
  const signatureRef = registerRaw(doc, raw);
  target.field.set(key("V"), signatureRef);
  if (hasArea(target.rect) && (options.appearance || !(target.widget.lookup(key("AP")) instanceof PDFDict))) {
    target.widget.set(key("AP"), doc.context.obj({ N: addSignatureAppearance(doc.context, options.appearance, target.rect, target.rotation) }));
  }
  markSigFlags(doc);
  if (options.certify !== null) {
    const perms = doc.catalog.lookupMaybe(key("Perms"), PDFDict) ?? doc.context.obj({});
    perms.set(key("DocMDP"), signatureRef);
    doc.catalog.set(key("Perms"), perms);
  }
  const output = await commitUpdate(doc, section, bytes);
  return { bytes: output, placeholder: locate(output, bytes.length, signatureRef, raw), fieldName: target.name };
}

export async function prepareDocTimestamp(bytes: Uint8Array): Promise<PreparedSignature> {
  const { doc, section } = await loadForUpdate(bytes);
  const fields = collectFields(doc);
  const raw = signatureDictionary([
    ["Type", "/DocTimeStamp"],
    ["Filter", "/Adobe.PPKLite"],
    ["SubFilter", "/ETSI.RFC3161"],
    ["ByteRange", "byteRange"],
    ["Contents", "contents"],
  ]);
  const signatureRef = registerRaw(doc, raw);
  const target = newTarget(doc, fields, 1, [0, 0, 0, 0]);
  target.field.set(key("V"), signatureRef);
  markSigFlags(doc);
  const output = await commitUpdate(doc, section, bytes);
  return { bytes: output, placeholder: locate(output, bytes.length, signatureRef, raw), fieldName: target.name };
}

export async function appendDss(bytes: Uint8Array, material: ValidationMaterial): Promise<Uint8Array> {
  const empty = !material.certs.length && !material.ocsps.length && !material.crls.length && !Object.keys(material.vri).length;
  if (empty) {
    return bytes;
  }
  const { doc, section } = await loadForUpdate(bytes);
  appendDssTo(doc, material);
  return commitUpdate(doc, section, bytes);
}
