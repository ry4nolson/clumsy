import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from "@cantoo/pdf-lib";
import { writeAnnotationsReporting } from "../src/lib/notesPdf";
import { answerPageEditJob } from "../src/lib/pageEdits";
import { encryptUncompressedStrings } from "../src/lib/pdfDecrypt";
import {
  checkByteRange,
  endsRevision,
  gapBytes,
  intactSignatures,
  laterRevisionCount,
  mayHaveSignatures,
  mergeVerdicts,
  parseByteRange,
  pdfDateToIso,
  revisionEnds,
  rewriteAction,
  scanSignatures,
  signatureWarning,
  trimZeroPadding,
  verifyItemsOf,
} from "../src/lib/pdfSignatures";
import type { ByteRange, SignatureScan, SignatureVerdict } from "../src/lib/signatureTypes";

const PLACEHOLDER = "1000000000";
const CMS = "3082abcd";
const encoder = new TextEncoder();
const latin1 = new TextDecoder("latin1");

type SigOptions = {
  name?: string;
  parent?: string;
  page?: number;
  value?: boolean;
  docTimestamp?: boolean;
  docMdp?: number | null;
  perms?: boolean;
  cms?: string;
};

function addSignatureField(doc: PDFDocument, options: SigOptions = {}) {
  const { context } = doc;
  const page = doc.getPage(options.page ?? 0);
  const value =
    options.value === false
      ? null
      : context.obj({
          Type: options.docTimestamp ? "DocTimeStamp" : "Sig",
          Filter: "Adobe.PPKLite",
          SubFilter: options.docTimestamp ? "ETSI.RFC3161" : "ETSI.CAdES.detached",
          M: PDFString.of("D:20261111093000+01'00'"),
          Name: PDFString.of("Ryan Olson"),
          Reason: PDFString.of("Approved"),
          ByteRange: [0, Number(PLACEHOLDER), Number(PLACEHOLDER), Number(PLACEHOLDER)],
          Contents: PDFHexString.of((options.cms ?? CMS).padEnd(256, "0")),
          ...(options.docMdp !== undefined && options.docMdp !== null
            ? { Reference: [{ Type: "SigRef", TransformMethod: "DocMDP", TransformParams: { Type: "TransformParams", P: options.docMdp, V: "1.2" } }] }
            : {}),
        });
  const valueRef = value && context.register(value);
  const widget = context.obj({ Type: "Annot", Subtype: "Widget", Rect: [300, 100, 500, 50], P: page.ref, F: 4 });
  const widgetRef = context.register(widget);
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (annots) {
    annots.push(widgetRef);
  } else {
    page.node.set(PDFName.of("Annots"), context.obj([widgetRef]));
  }
  let fieldRef: PDFRef;
  if (options.parent) {
    const field = context.obj({ T: PDFString.of(options.name ?? "Signature1"), Kids: [widgetRef], ...(valueRef ? { V: valueRef } : {}) });
    fieldRef = context.register(field);
    widget.set(PDFName.of("Parent"), fieldRef);
    const parent = context.obj({ T: PDFString.of(options.parent), FT: "Sig", Kids: [fieldRef] });
    const parentRef = context.register(parent);
    field.set(PDFName.of("Parent"), parentRef);
    fieldRef = parentRef;
  } else {
    widget.set(PDFName.of("FT"), PDFName.of("Sig"));
    widget.set(PDFName.of("T"), PDFString.of(options.name ?? "Signature1"));
    if (valueRef) {
      widget.set(PDFName.of("V"), valueRef);
    }
    fieldRef = widgetRef;
  }
  const form = doc.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict) ?? context.obj({ Fields: [], SigFlags: 3 });
  doc.catalog.set(PDFName.of("AcroForm"), form);
  form.lookup(PDFName.of("Fields"), PDFArray).push(fieldRef);
  if (options.perms && valueRef) {
    doc.catalog.set(PDFName.of("Perms"), context.obj({ DocMDP: valueRef }));
  }
  return valueRef;
}

function writeAt(bytes: Uint8Array, at: number, text: string) {
  bytes.set(encoder.encode(text), at);
}

function fillPlaceholders(bytes: Uint8Array, override?: (range: ByteRange) => ByteRange) {
  const text = latin1.decode(bytes);
  const pattern = new RegExp(`\\[\\s*0 ${PLACEHOLDER} ${PLACEHOLDER} ${PLACEHOLDER}\\s*\\]`, "g");
  const ranges: ByteRange[] = [];
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    const contentsKey = text.indexOf("/Contents", text.lastIndexOf(" obj", at));
    const open = text.indexOf("<", contentsKey);
    const close = text.indexOf(">", open);
    const natural: ByteRange = [0, open, close + 1, bytes.length - close - 1];
    const range = override ? override(natural) : natural;
    writeAt(bytes, at, `[${range.join(" ")}]`.replace("]", " ".repeat(match[0].length - `[${range.join(" ")}]`.length) + "]"));
    ranges.push(natural);
  }
  return ranges;
}

async function makeDoc(pages = 2) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pages; index++) {
    doc.addPage([612, 792]);
  }
  return doc;
}

async function signedPdf(options: SigOptions = {}, override?: (range: ByteRange) => ByteRange) {
  const doc = await makeDoc();
  const ref = addSignatureField(doc, options);
  const bytes = await doc.save({ useObjectStreams: false });
  const ranges = fillPlaceholders(bytes, override);
  return { bytes, ref, ranges };
}

describe("byte helpers", () => {
  it("finds revision ends with their line endings", () => {
    const bytes = encoder.encode("%PDF-1.7\n...%%EOF\r\nmore%%EOF\nlast%%EOF");
    const ends = revisionEnds(bytes);
    expect(ends.map((end) => end.end)).toEqual([19, 29, bytes.length]);
    expect(endsRevision(ends, 17)).toBe(true);
    expect(endsRevision(ends, 19)).toBe(true);
    expect(endsRevision(ends, 20)).toBe(false);
    expect(laterRevisionCount(ends, 19)).toBe(2);
  });

  it("reads byte ranges strictly", () => {
    expect(parseByteRange([0, 10, 20, 5]).problems).toEqual([]);
    expect(parseByteRange([0, 10.5, 20, 5]).problems).toHaveLength(1);
    expect(parseByteRange([0, 10, 20]).problems).toHaveLength(1);
    expect(parseByteRange([0, -1, 20, 5]).problems).toHaveLength(1);
    expect(parseByteRange([0, undefined, 20, 5]).range).toEqual([0, 0, 20, 5]);
    expect(parseByteRange(null).problems).toEqual(["The signature has no byte range."]);
  });

  it("decodes the contents gap and trims trailing zero padding", () => {
    const bytes = encoder.encode("/Contents <3082ab00000000>%%EOF");
    const range: ByteRange = [0, 10, 26, 5];
    expect(checkByteRange(bytes, range).ok).toBe(true);
    expect([...gapBytes(bytes, range)]).toEqual([0x30, 0x82, 0xab, 0, 0, 0, 0]);
    expect([...trimZeroPadding(gapBytes(bytes, range))]).toEqual([0x30, 0x82, 0xab]);
  });

  it("rejects malformed byte ranges without throwing", () => {
    const bytes = encoder.encode("/Contents <3082ab00000000>%%EOF");
    expect(checkByteRange(bytes, [1, 9, 26, 5]).ok).toBe(false);
    expect(checkByteRange(bytes, [0, 10, 26, 50]).problems[0]).toMatch(/past the end/);
    expect(checkByteRange(bytes, [0, 11, 26, 5]).problems[0]).toMatch(/isn't exactly/);
    expect(checkByteRange(bytes, [0, 10, 9, 5]).ok).toBe(false);
    expect(checkByteRange(encoder.encode("/Other    <3082ab00000000>%%EOF"), range()).problems[0]).toMatch(/Contents/);
    expect(checkByteRange(bytes, [0, 10, 26, 2])).toMatchObject({ ok: true, coversWholeFile: false });
    expect(checkByteRange(bytes, [0, 10, 26, 2]).problems[0]).toMatch(/saved version/);
  });

  it("converts PDF dates to ISO 8601", () => {
    expect(pdfDateToIso("D:20261111093000+01'00'")).toBe("2026-11-11T09:30:00+01:00");
    expect(pdfDateToIso("D:20261111093000Z")).toBe("2026-11-11T09:30:00Z");
    expect(pdfDateToIso("D:2026")).toBe("2026-01-01T00:00:00Z");
    expect(pdfDateToIso("20261111")).toBe("2026-11-11T00:00:00Z");
    expect(pdfDateToIso("D:20261311")).toBeNull();
    expect(pdfDateToIso("yesterday")).toBeNull();
    expect(pdfDateToIso(null)).toBeNull();
  });

  it("spots files that may carry signatures", () => {
    expect(mayHaveSignatures(encoder.encode("<< /ByteRange [0 1 2 3] >>"))).toBe(true);
    expect(mayHaveSignatures(encoder.encode("<< /ByteRang [0 1 2 3] >>"))).toBe(false);
  });
});

const range = (): ByteRange => [0, 10, 26, 5];

describe("scanSignatures", () => {
  it("returns empty lists for a file without a form", async () => {
    const bytes = await (await makeDoc()).save();
    expect(await scanSignatures(bytes)).toEqual({ signatures: [], emptyFields: [], dss: null, encrypted: false, certified: null });
  });

  it("reads a signature on a merged field and widget", async () => {
    const { bytes, ref, ranges } = await signedPdf();
    const scan = await scanSignatures(bytes);
    expect(scan.signatures).toHaveLength(1);
    expect(scan.signatures[0]).toMatchObject({
      id: `${ref?.objectNumber}R`,
      fieldName: "Signature1",
      kind: "approval",
      subFilter: "ETSI.CAdES.detached",
      byteRange: ranges[0],
      byteRangeOk: true,
      problems: [],
      revisionEnd: bytes.length,
      coversWholeFile: true,
      laterRevisions: 0,
      docMdp: null,
      claimedTime: "2026-11-11T09:30:00+01:00",
      name: "Ryan Olson",
      reason: "Approved",
      location: null,
      page: 1,
      rect: [300, 50, 500, 100],
    });
    expect(scan.certified).toBeNull();
    expect(intactSignatures(scan)).toBe(1);
  });

  it("follows /Kids hierarchies and inherits the field type", async () => {
    const { bytes } = await signedPdf({ parent: "form", name: "approver", page: 1 });
    const scan = await scanSignatures(bytes);
    expect(scan.signatures.map((signature) => [signature.fieldName, signature.page, signature.byteRangeOk])).toEqual([["form.approver", 2, true]]);
  });

  it("survives field trees that loop back on themselves", async () => {
    const doc = await makeDoc();
    addSignatureField(doc, { parent: "form", name: "approver" });
    const form = doc.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
    const fields = form.lookup(PDFName.of("Fields"), PDFArray);
    const parentRef = fields.get(0) as PDFRef;
    const parent = doc.context.lookup(parentRef, PDFDict);
    parent.lookup(PDFName.of("Kids"), PDFArray).push(parentRef);
    fields.push(parentRef);
    const bytes = await doc.save({ useObjectStreams: false });
    fillPlaceholders(bytes);
    const scan = await scanSignatures(bytes);
    expect(scan.signatures.map((signature) => signature.fieldName)).toEqual(["form.approver"]);
  });

  it("lists empty signature fields", async () => {
    const doc = await makeDoc();
    addSignatureField(doc, { value: false, name: "Approver", page: 1 });
    const scan = await scanSignatures(await doc.save());
    expect(scan.signatures).toEqual([]);
    expect(scan.emptyFields).toEqual([{ fieldName: "Approver", page: 2, rect: [300, 50, 500, 100] }]);
  });

  it("reports every revision after a signature", async () => {
    const first = await signedPdf();
    const doc = await PDFDocument.load(first.bytes, { forIncrementalUpdate: true, updateMetadata: false });
    addSignatureField(doc, { name: "Second", page: 1 });
    const bytes = await doc.commit();
    expect(latin1.decode(bytes.subarray(0, first.bytes.length))).toBe(latin1.decode(first.bytes));
    fillPlaceholders(bytes);
    const scan = await scanSignatures(bytes);
    expect(scan.signatures.map(({ fieldName, revisionEnd, coversWholeFile, laterRevisions, byteRangeOk }) => ({ fieldName, revisionEnd, coversWholeFile, laterRevisions, byteRangeOk }))).toEqual([
      { fieldName: "Signature1", revisionEnd: first.bytes.length, coversWholeFile: false, laterRevisions: 1, byteRangeOk: true },
      { fieldName: "Second", revisionEnd: bytes.length, coversWholeFile: true, laterRevisions: 0, byteRangeOk: true },
    ]);
  });

  it("recognizes document timestamps", async () => {
    const { bytes } = await signedPdf({ docTimestamp: true });
    const [signature] = (await scanSignatures(bytes)).signatures;
    expect(signature).toMatchObject({ kind: "timestamp", subFilter: "ETSI.RFC3161", byteRangeOk: true });
  });

  it("reads DocMDP from the transform parameters and the catalog's /Perms", async () => {
    const certified = await scanSignatures((await signedPdf({ docMdp: 1, perms: true })).bytes);
    expect(certified.signatures[0]).toMatchObject({ kind: "certification", docMdp: 1 });
    expect(certified.certified).toBe(1);
    const permsOnly = await scanSignatures((await signedPdf({ perms: true })).bytes);
    expect(permsOnly.signatures[0]).toMatchObject({ kind: "certification", docMdp: 2 });
    expect(permsOnly.certified).toBe(2);
    const referenceOnly = await scanSignatures((await signedPdf({ docMdp: 3 })).bytes);
    expect(referenceOnly.certified).toBe(3);
  });

  it.each([
    ["not starting at zero", (r: ByteRange): ByteRange => [5, r[1] - 5, r[2], r[3]]],
    ["running past the end", (r: ByteRange): ByteRange => [0, r[1], r[2], r[3] + 100]],
    ["a gap that misses the contents", (r: ByteRange): ByteRange => [0, r[1] + 2, r[2], r[3]]],
    ["an empty gap", (r: ByteRange): ByteRange => [0, r[1], r[1], r[3]]],
  ])("marks a byte range %s as malformed", async (_, override) => {
    const { bytes } = await signedPdf({}, override);
    const scan = await scanSignatures(bytes);
    expect(scan.signatures[0].byteRangeOk).toBe(false);
    expect(scan.signatures[0].problems.length).toBeGreaterThan(0);
    expect(intactSignatures(scan)).toBe(0);
  });

  it("refuses a byte range pointing at another signature's contents", async () => {
    const doc = await makeDoc();
    addSignatureField(doc, { name: "A", cms: "aaaa" });
    addSignatureField(doc, { name: "B", cms: "bbbb", page: 1 });
    const bytes = await doc.save({ useObjectStreams: false });
    const natural = fillPlaceholders(new Uint8Array(bytes));
    fillPlaceholders(bytes, () => natural[1]);
    const scan = await scanSignatures(bytes);
    const a = scan.signatures.find((signature) => signature.fieldName === "A");
    const b = scan.signatures.find((signature) => signature.fieldName === "B");
    expect(a?.byteRangeOk).toBe(false);
    expect(a?.problems[0]).toMatch(/this signature's contents/);
    expect(b?.byteRangeOk).toBe(true);
  });

  it("keeps a signature without a byte range as malformed", async () => {
    const doc = await makeDoc();
    const ref = addSignatureField(doc);
    doc.context.lookup(ref as PDFRef, PDFDict).delete(PDFName.of("ByteRange"));
    const scan = await scanSignatures(await doc.save());
    expect(scan.signatures[0]).toMatchObject({ byteRangeOk: false, problems: ["The signature has no byte range."], revisionEnd: 0 });
  });

  it("decodes /DSS streams", async () => {
    const doc = await makeDoc();
    const cert = new Uint8Array([0x30, 0x82, 1, 2, 3]);
    const ocsp = new Uint8Array([0x30, 0x03, 9, 9, 9]);
    const { context } = doc;
    doc.catalog.set(PDFName.of("DSS"), context.obj({ Certs: [context.register(context.stream(cert))], OCSPs: [context.register(context.flateStream(ocsp))] }));
    const scan = await scanSignatures(await doc.save());
    expect(scan.dss?.certs.map((blob) => [...blob])).toEqual([[...cert]]);
    expect(scan.dss?.ocsps.map((blob) => [...blob])).toEqual([[...ocsp]]);
    expect(scan.dss?.crls).toEqual([]);
  });

  it("scans encrypted files with their password", async () => {
    const doc = await makeDoc();
    addSignatureField(doc);
    doc.encrypt({ userPassword: "secret", ownerPassword: "secret" });
    encryptUncompressedStrings(doc);
    const bytes = await doc.save({ useObjectStreams: true });
    fillPlaceholders(bytes);
    const scan = await scanSignatures(bytes, "secret");
    expect(scan.encrypted).toBe(true);
    expect(scan.signatures[0]).toMatchObject({ byteRangeOk: true, name: "Ryan Olson", coversWholeFile: true });
    await expect(scanSignatures(bytes, "wrong")).rejects.toThrow("This PDF's password didn't work.");
  });

  it("answers scan jobs from the worker", async () => {
    const { bytes } = await signedPdf();
    const [response] = await answerPageEditJob({ op: "scanSignatures", bytes });
    expect("result" in response && response.result.scan?.signatures[0].byteRangeOk).toBe(true);
  });
});

describe("phase 0", () => {
  it("words the warning for one or several signatures", () => {
    expect(signatureWarning(0, "Rotating pages")).toBeNull();
    expect(signatureWarning(1, "Rotating pages")).toBe("This document has a digital signature. Rotating pages removes it.");
    expect(signatureWarning(2, "Flattening the form")).toBe("This document has 2 digital signatures. Flattening the form removes them.");
  });

  it("names the action for every rewriting edit", () => {
    expect(rewriteAction({ kind: "rotate", pages: [0], by: 90 }, false)).toBe("Rotating pages");
    expect(rewriteAction({ kind: "flatten" }, false)).toBe("Flattening the form");
    expect(rewriteAction({ kind: "protect", password: "x" }, false)).toBe("Setting a password");
    expect(rewriteAction({ kind: "protect", password: "x" }, true)).toBe("Changing the password");
    expect(rewriteAction({ kind: "protect", password: null }, true)).toBe("Removing the password");
  });

  it("verifies only intact signatures and reports the rest as malformed", () => {
    const base = { kind: "approval" as const, subFilter: "ETSI.CAdES.detached", revisionEnd: 10, coversWholeFile: true, laterRevisions: 0, docMdp: null, name: null, reason: null, location: null, contactInfo: null, page: null, rect: null };
    const scan: SignatureScan = {
      signatures: [
        { ...base, id: "1R", fieldName: "A", byteRange: [0, 1, 2, 3], byteRangeOk: true, problems: [], claimedTime: null },
        { ...base, id: "2R", fieldName: "B", byteRange: [0, 0, 0, 0], byteRangeOk: false, problems: ["bad"], claimedTime: "2026-01-01T00:00:00Z" },
      ],
      emptyFields: [],
      dss: null,
      encrypted: false,
      certified: null,
    };
    expect(verifyItemsOf(scan)).toEqual([{ id: "1R", byteRange: [0, 1, 2, 3], subFilter: "ETSI.CAdES.detached", claimedTime: null }]);
    expect(intactSignatures(scan)).toBe(1);
    const verdict = { id: "1R", status: "valid" } as SignatureVerdict;
    const merged = mergeVerdicts(scan, [verdict]);
    expect(merged[0]).toBe(verdict);
    expect(merged[1]).toMatchObject({ id: "2R", status: "invalid", integrity: "malformed", problems: ["bad"], signingTime: { source: "claimed" } });
    expect(mergeVerdicts(scan, [])).toHaveLength(1);
  });

  it("keeps signatures when notes append an update", async () => {
    const { bytes } = await signedPdf();
    const original = bytes.slice();
    const note = { id: "n", pageIndex: 0, rect: [10, 10, 30, 30], text: "Hi", fresh: true, deleted: false };
    const { bytes: saved, removedSignatures } = await writeAnnotationsReporting(bytes, [note], []);
    expect(removedSignatures).toBe(0);
    expect(latin1.decode(saved.subarray(0, original.length))).toBe(latin1.decode(original));
    const scan = await scanSignatures(saved);
    expect(scan.signatures[0]).toMatchObject({ byteRangeOk: true, laterRevisions: 1 });
  });

  it("reports signatures a full rewrite removes", async () => {
    const { bytes } = await signedPdf();
    const text = latin1.decode(bytes);
    const at = text.lastIndexOf("startxref") + "startxref\n".length;
    const digits = /^\d+/.exec(text.slice(at))?.[0] ?? "";
    writeAt(bytes, at, "1".padStart(digits.length, "0"));
    const note = { id: "n", pageIndex: 0, rect: [10, 10, 30, 30], text: "Hi", fresh: true, deleted: false };
    const { bytes: saved, removedSignatures } = await writeAnnotationsReporting(bytes, [note], []);
    expect(removedSignatures).toBe(1);
    expect(intactSignatures(await scanSignatures(saved))).toBe(0);
  });

  it("reports signatures a decrypting rewrite removes", async () => {
    const doc = await makeDoc();
    addSignatureField(doc);
    doc.encrypt({ userPassword: "secret", ownerPassword: "secret" });
    encryptUncompressedStrings(doc);
    const bytes = await doc.save({ useObjectStreams: true });
    fillPlaceholders(bytes);
    const note = { id: "n", pageIndex: 0, rect: [10, 10, 30, 30], text: "Hi", fresh: true, deleted: false };
    const [response] = await answerPageEditJob({ op: "annotations", bytes, notes: [note], markup: [], password: "secret" });
    expect("result" in response && response.result.removedSignatures).toBe(1);
  });
});
