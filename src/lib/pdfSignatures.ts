import {
  EncryptedPDFError,
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
  type PDFDocument,
} from "@cantoo/pdf-lib";
import { installDecryptedStrings, loadDecrypting } from "./pdfDecrypt";
import { onlySignaturesAdded } from "./pdfRevisionChanges";
import { acroForm, pageLeafRefs } from "./pdfStructure";
import { hasEncryptEntry } from "./protection";
import { checkByteRange, gapBytes, parseByteRange, pdfDateToIso, revisionEnds, type RevisionEnd } from "./signatureBytes";
import type { DocMdpPermission, DssData, EmptySignatureField, PdfSignature, SignatureKind, SignatureScan } from "./signatureTypes";

export * from "./signatureBytes";

installDecryptedStrings();

const key = PDFName.of;
const MAX_FIELDS = 100_000;
const PASSWORD_FAILED = "This PDF's password didn't work.";

type Widget = { dict: PDFDict; ref: PDFRef | null };

type SignatureField = { name: string; value: PDFObject | undefined; widgets: Widget[] };

type Rect = [number, number, number, number];

const textOf = (dict: PDFDict, name: string) => dict.lookupMaybe(key(name), PDFString, PDFHexString)?.decodeText() ?? null;

const nameOf = (dict: PDFDict, name: string) => dict.lookupMaybe(key(name), PDFName)?.decodeText() ?? null;

function resolve(doc: PDFDocument, object: PDFObject | undefined) {
  return object instanceof PDFRef ? doc.context.lookup(object) : object;
}

const asDict = (doc: PDFDocument, object: PDFObject | undefined) => {
  const resolved = resolve(doc, object);
  return resolved instanceof PDFDict ? resolved : null;
};

function numbersOf(doc: PDFDocument, object: PDFObject | undefined) {
  const array = resolve(doc, object);
  if (!(array instanceof PDFArray)) {
    return null;
  }
  return array.asArray().map((item) => {
    const value = resolve(doc, item);
    return value instanceof PDFNumber ? value.asNumber() : undefined;
  });
}

function rectOf(doc: PDFDocument, dict: PDFDict): Rect | null {
  const values = numbersOf(doc, dict.get(key("Rect")));
  if (values?.length !== 4 || values.some((value) => value === undefined)) {
    return null;
  }
  const [x1, y1, x2, y2] = values as number[];
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

const isFieldNode = (dict: PDFDict) => dict.has(key("T")) || dict.has(key("FT")) || (dict.has(key("Kids")) && !dict.has(key("Subtype")));

export function signatureFields(doc: PDFDocument): SignatureField[] {
  const fields = acroForm(doc)?.lookupMaybe(key("Fields"), PDFArray);
  if (!fields) {
    return [];
  }
  type Entry = { object: PDFObject; parent: string | null; type: string | null; value: PDFObject | undefined };
  const found: SignatureField[] = [];
  const seen = new Set<PDFDict>();
  const stack: Entry[] = fields
    .asArray()
    .reverse()
    .map((object) => ({ object, parent: null, type: null, value: undefined }));
  while (stack.length && seen.size < MAX_FIELDS) {
    const { object, parent, type: inheritedType, value: inheritedValue } = stack.pop() as Entry;
    const dict = asDict(doc, object);
    if (!dict || seen.has(dict)) {
      continue;
    }
    seen.add(dict);
    const partial = textOf(dict, "T");
    const name = partial === null ? (parent ?? "") : parent ? `${parent}.${partial}` : partial;
    const type = nameOf(dict, "FT") ?? inheritedType;
    const value = dict.has(key("V")) ? dict.get(key("V")) : inheritedValue;
    const kids = (dict.lookupMaybe(key("Kids"), PDFArray)?.asArray() ?? []).map((kid) => ({ object: kid, dict: asDict(doc, kid) }));
    const childFields = kids.filter((kid) => kid.dict && isFieldNode(kid.dict));
    if (childFields.length) {
      stack.push(...childFields.reverse().map((kid) => ({ object: kid.object, parent: name || null, type, value })));
      continue;
    }
    if (type !== "Sig") {
      continue;
    }
    const widgets: Widget[] = kids.flatMap((kid) => (kid.dict && !seen.has(kid.dict) ? [{ dict: kid.dict, ref: kid.object instanceof PDFRef ? kid.object : null }] : []));
    kids.forEach((kid) => kid.dict && seen.add(kid.dict));
    if (nameOf(dict, "Subtype") === "Widget" || !widgets.length) {
      widgets.unshift({ dict, ref: object instanceof PDFRef ? object : null });
    }
    found.push({ name, value, widgets });
  }
  return found;
}

function annotationPages(doc: PDFDocument) {
  const byDict = new Map<PDFDict, number>();
  const byPage = new Map<PDFDict, number>();
  pageLeafRefs(doc).forEach((pageRef, index) => {
    const page = doc.context.lookup(pageRef);
    if (!(page instanceof PDFDict)) {
      return;
    }
    byPage.set(page, index + 1);
    for (const annot of page.lookupMaybe(key("Annots"), PDFArray)?.asArray() ?? []) {
      const dict = asDict(doc, annot);
      if (dict && !byDict.has(dict)) {
        byDict.set(dict, index + 1);
      }
    }
  });
  return (widget: PDFDict) => {
    const owner = asDict(doc, widget.get(key("P")));
    return byDict.get(widget) ?? (owner ? byPage.get(owner) : undefined) ?? null;
  };
}

function docMdpOf(doc: PDFDocument, signature: PDFDict): DocMdpPermission | null {
  const references = resolve(doc, signature.get(key("Reference")));
  if (!(references instanceof PDFArray)) {
    return null;
  }
  for (const item of references.asArray()) {
    const reference = asDict(doc, item);
    if (reference && nameOf(reference, "TransformMethod") === "DocMDP") {
      const params = asDict(doc, reference.get(key("TransformParams")));
      const permission = params?.lookupMaybe(key("P"), PDFNumber)?.asNumber() ?? 2;
      return permission === 1 || permission === 3 ? permission : 2;
    }
  }
  return null;
}

function decodeStream(stream: PDFStream) {
  try {
    const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
    return [bytes.slice()];
  } catch {
    return [];
  }
}

export function dssOf(doc: PDFDocument): DssData | null {
  const dss = doc.catalog.lookupMaybe(key("DSS"), PDFDict);
  if (!dss) {
    return null;
  }
  const streams = (name: string) =>
    (dss.lookupMaybe(key(name), PDFArray)?.asArray() ?? []).flatMap((item) => {
      const stream = resolve(doc, item);
      return stream instanceof PDFStream ? decodeStream(stream) : [];
    });
  return { certs: streams("Certs"), ocsps: streams("OCSPs"), crls: streams("CRLs") };
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index]);

const kindOf = (signature: PDFDict, subFilter: string, docMdp: DocMdpPermission | null, certifying: boolean): SignatureKind =>
  nameOf(signature, "Type") === "DocTimeStamp" || subFilter === "ETSI.RFC3161" ? "timestamp" : docMdp !== null || certifying ? "certification" : "approval";

type Context = { doc: PDFDocument; bytes: Uint8Array; ends: RevisionEnd[]; encrypted: boolean; certifier: PDFDict | null; pageOf: (widget: PDFDict) => number | null };

function readSignature(context: Context, field: SignatureField, signature: PDFDict, id: string): PdfSignature {
  const { doc, bytes, ends, encrypted, certifier, pageOf } = context;
  const subFilter = nameOf(signature, "SubFilter") ?? "";
  const parsed = parseByteRange(numbersOf(doc, signature.get(key("ByteRange"))));
  const check = checkByteRange(bytes, parsed.range, ends, parsed.problems);
  const problems = [...check.problems];
  let ok = check.ok;
  const contents = signature.lookup(key("Contents"));
  if (ok && !encrypted && contents instanceof PDFHexString && !sameBytes(contents.asBytes(), gapBytes(bytes, parsed.range))) {
    ok = false;
    problems.unshift("The byte range doesn't point at this signature's contents.");
  }
  const docMdp = docMdpOf(doc, signature);
  const certifying = certifier === signature;
  const widget = field.widgets.find((candidate) => pageOf(candidate.dict) !== null) ?? field.widgets[0];
  const rect = widget ? rectOf(doc, widget.dict) : null;
  return {
    id,
    fieldName: field.name,
    kind: kindOf(signature, subFilter, docMdp, certifying),
    subFilter,
    byteRange: parsed.range,
    byteRangeOk: ok,
    problems,
    revisionEnd: ok ? check.revisionEnd : 0,
    coversWholeFile: ok && check.coversWholeFile,
    modifiedAfter: ok && !check.coversWholeFile,
    laterRevisions: ok ? check.laterRevisions : 0,
    docMdp: docMdp ?? (certifying ? 2 : null),
    claimedTime: pdfDateToIso(textOf(signature, "M")),
    name: textOf(signature, "Name"),
    reason: textOf(signature, "Reason"),
    location: textOf(signature, "Location"),
    contactInfo: textOf(signature, "ContactInfo"),
    page: widget ? pageOf(widget.dict) : null,
    rect: rect && rect[2] > rect[0] && rect[3] > rect[1] ? rect : null,
  };
}

function idOf(field: SignatureField, index: number) {
  return field.value instanceof PDFRef ? `${field.value.objectNumber}R` : `field-${index}:${field.name}`;
}

export function scanDocument(doc: PDFDocument, bytes: Uint8Array, encrypted = false): SignatureScan {
  const fields = signatureFields(doc);
  if (!fields.length) {
    return { signatures: [], emptyFields: [], dss: dssOf(doc), encrypted, certified: null };
  }
  const certifier = asDict(doc, doc.catalog.lookupMaybe(key("Perms"), PDFDict)?.get(key("DocMDP")));
  const context: Context = { doc, bytes, ends: revisionEnds(bytes), encrypted, certifier, pageOf: annotationPages(doc) };
  const signatures: PdfSignature[] = [];
  const emptyFields: EmptySignatureField[] = [];
  fields.forEach((field, index) => {
    const value = resolve(doc, field.value);
    if (value instanceof PDFDict) {
      signatures.push(readSignature(context, field, value, idOf(field, index)));
      return;
    }
    const widget = field.widgets.find((candidate) => context.pageOf(candidate.dict) !== null);
    const page = widget && context.pageOf(widget.dict);
    const rect = widget && rectOf(doc, widget.dict);
    if (page && rect) {
      emptyFields.push({ fieldName: field.name, page, rect });
    }
  });
  signatures.sort((a, b) => (a.byteRangeOk === b.byteRangeOk ? a.revisionEnd - b.revisionEnd : a.byteRangeOk ? -1 : 1));
  const certification = signatures.find((signature) => signature.kind === "certification");
  return { signatures, emptyFields, dss: dssOf(doc), encrypted, certified: certification?.docMdp ?? null };
}

const passwordRefused = (error: unknown) =>
  error instanceof EncryptedPDFError || (error instanceof Error && /^(NEEDS PASSWORD|Password incorrect)/.test(error.message));

async function markSignatureOnlyUpdates(scan: SignatureScan, doc: PDFDocument, bytes: Uint8Array, password: string) {
  const verdicts = new Map<number, boolean>();
  for (const signature of scan.signatures) {
    if (!signature.modifiedAfter) {
      continue;
    }
    if (!verdicts.has(signature.revisionEnd)) {
      const before = await loadDecrypting(bytes.slice(0, signature.revisionEnd), { updateMetadata: false, password }).catch(() => null);
      verdicts.set(signature.revisionEnd, !before || !onlySignaturesAdded(before, doc));
    }
    signature.modifiedAfter = verdicts.get(signature.revisionEnd) as boolean;
  }
  return scan;
}

export async function scanSignatures(bytes: Uint8Array, password?: string): Promise<SignatureScan> {
  try {
    const doc = await loadDecrypting(bytes, { updateMetadata: false, password: password ?? "" });
    const scan = scanDocument(doc, bytes, doc.context.isDecrypted || hasEncryptEntry(bytes) === true);
    return await markSignatureOnlyUpdates(scan, doc, bytes, password ?? "");
  } catch (error) {
    throw passwordRefused(error) ? new Error(PASSWORD_FAILED) : error;
  }
}
