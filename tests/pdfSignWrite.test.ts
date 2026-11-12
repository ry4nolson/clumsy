import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from "@cantoo/pdf-lib";
import { appendDss, pdfDate, prepareDocTimestamp, prepareSignature, sectionAt } from "../src/lib/pdfSignWrite";
import { scanSignatures } from "../src/lib/pdfSignatures";
import { rotationMatrix, splitBox, winAnsiLine } from "../src/lib/signatureAppearance";
import { CONTENTS_HEX_LENGTH, type PrepareSignatureOptions, type PreparedSignature, type ValidationMaterial } from "../src/lib/signatureTypes";
import { openPdf } from "./pdfjsNode";

const key = PDFName.of;
const latin1 = new TextDecoder("latin1");

async function makePdf({ objectStreams = false, pages = 2, rotate = 0 } = {}) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pages; index++) {
    doc.addPage([612, 792]).setRotation({ type: "degrees", angle: rotate } as never);
  }
  return doc.save({ useObjectStreams: objectStreams });
}

async function withEmptyField(extra: (doc: PDFDocument, field: PDFDict) => void = () => {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const { context } = doc;
  const field = context.obj({ Type: "Annot", Subtype: "Widget", FT: "Sig", T: PDFString.of("Approver"), F: 4, Rect: [72, 72, 272, 132], P: page.ref });
  const fieldRef = context.register(field);
  page.node.set(key("Annots"), context.obj([fieldRef]));
  doc.catalog.set(key("AcroForm"), context.register(context.obj({ Fields: [fieldRef] })));
  extra(doc, field);
  return doc.save({ useObjectStreams: false });
}

const options = (patch: Partial<PrepareSignatureOptions> = {}): PrepareSignatureOptions => ({
  target: { kind: "new", page: 1, rect: [350, 60, 560, 130] },
  appearance: {
    outline: { path: "M 10 40 C 30 0, 50 80, 70 40 S 110 0, 130 40", viewBox: [0, 0, 140, 80], areContours: false, thickness: 3 },
    lines: ["Digitally signed by Ryan Ølson ✓", "2026-11-11 14:03 -06:00"],
  },
  certify: null,
  lockField: false,
  signingTime: "2026-11-11T14:03:00-06:00",
  reason: "Approved",
  location: "Austin, TX",
  name: "Ryan Olson",
  ...patch,
});

function fill({ bytes, placeholder }: PreparedSignature, fake = "3082abcdef0123") {
  const out = bytes.slice();
  const { byteRangeAt, byteRangeLength, contentsAt, contentsLength } = placeholder;
  const gapEnd = contentsAt + contentsLength;
  const range = `[0 ${contentsAt} ${gapEnd} ${out.length - gapEnd}`;
  out.set(new TextEncoder().encode(range.padEnd(byteRangeLength - 1, " ") + "]"), byteRangeAt);
  out.set(new TextEncoder().encode(fake.padEnd(CONTENTS_HEX_LENGTH, "0")), contentsAt + 1);
  return out;
}

const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

function expectPlaceholder({ bytes, placeholder }: PreparedSignature, inputLength: number) {
  const { byteRangeAt, byteRangeLength, contentsAt, contentsLength } = placeholder;
  expect(byteRangeAt).toBeGreaterThan(inputLength);
  expect(latin1.decode(bytes.subarray(byteRangeAt, byteRangeAt + byteRangeLength))).toBe("[0000000000 0000000000 0000000000 0000000000]");
  expect(contentsLength).toBe(CONTENTS_HEX_LENGTH + 2);
  expect(latin1.decode(bytes.subarray(contentsAt, contentsAt + contentsLength))).toBe(`<${"0".repeat(CONTENTS_HEX_LENGTH)}>`);
  expect(latin1.decode(bytes.subarray(byteRangeAt - 11, byteRangeAt))).toBe("/ByteRange ");
  expect(latin1.decode(bytes.subarray(contentsAt - 10, contentsAt))).toBe("/Contents ");
}

function expectCoverage(signed: Uint8Array, contentsAt: number, contentsLength: number) {
  const [, a, b, c] = byteRangeIn(signed, contentsAt);
  expect(a).toBe(contentsAt);
  expect(b - a).toBe(contentsLength);
  expect(b + c).toBe(signed.length);
  expect(signed[a]).toBe("<".charCodeAt(0));
  expect(signed[b - 1]).toBe(">".charCodeAt(0));
}

function byteRangeIn(bytes: Uint8Array, contentsAt: number) {
  const window = latin1.decode(bytes.subarray(Math.max(0, contentsAt - 200), contentsAt));
  const match = /\/ByteRange \[(\d+) (\d+) (\d+) (\d+) *\]\s*\/Contents $/.exec(window);
  return (match?.slice(1) ?? []).map(Number);
}

async function signatureValue(bytes: Uint8Array, fieldName: string) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const fields = doc.catalog.lookup(key("AcroForm"), PDFDict).lookup(key("Fields"), PDFArray);
  const field = fields.asArray().map((ref) => doc.context.lookup(ref, PDFDict)).find((dict) => dict.lookupMaybe(key("T"), PDFString, PDFHexString)?.decodeText() === fieldName);
  return { doc, field: field!, value: field!.lookup(key("V"), PDFDict) };
}

async function opensInPdfJs(bytes: Uint8Array) {
  const pdf = await openPdf(bytes);
  const page = await pdf.getPage(1);
  const annotations = await page.getAnnotations();
  const operators = await page.getOperatorList();
  await pdf.loadingTask.destroy();
  return { annotations, operators };
}

describe("prepareSignature", () => {
  for (const objectStreams of [false, true]) {
    it(`appends a strict incremental update to a file with an xref ${objectStreams ? "stream" : "table"}`, async () => {
      const input = await makePdf({ objectStreams });
      const before = sectionAt(input, Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(latin1.decode(input))![1]));
      expect(before).toBe(objectStreams ? "stream" : "table");
      const prepared = await prepareSignature(input, options());
      expect(same(prepared.bytes.subarray(0, input.length), input)).toBe(true);
      expect(prepared.fieldName).toBe("Signature1");
      expectPlaceholder(prepared, input.length);
      const update = latin1.decode(prepared.bytes.subarray(input.length));
      expect(update.trimEnd().endsWith("%%EOF")).toBe(true);
      const startxref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(update)![1]);
      expect(sectionAt(prepared.bytes, startxref)).toBe(objectStreams ? "stream" : "table");
      const previous = /startxref\s+(\d+)/.exec(latin1.decode(input).slice(-64))![1];
      expect(update).toContain(`/Prev ${previous}`);
      expect(update).toMatch(/\d+ 0 obj\n<<\n\/Type \/Sig\n/);

      const signed = fill(prepared);
      expectCoverage(signed, prepared.placeholder.contentsAt, prepared.placeholder.contentsLength);
      const { value, field } = await signatureValue(signed, "Signature1");
      expect(value.get(key("SubFilter"))).toBe(key("ETSI.CAdES.detached"));
      expect(value.lookup(key("ByteRange"), PDFArray).asArray().map((entry) => (entry as PDFNumber).asNumber())).toEqual(byteRangeIn(signed, prepared.placeholder.contentsAt));
      expect(value.lookup(key("Contents"), PDFHexString).asBytes().slice(0, 7)).toEqual(new Uint8Array([0x30, 0x82, 0xab, 0xcd, 0xef, 0x01, 0x23]));
      expect(value.lookup(key("M"), PDFString).decodeText()).toBe("D:20261111140300-06'00'");
      expect(value.lookup(key("Reason"), PDFHexString).decodeText()).toBe("Approved");
      expect(value.lookup(key("Name"), PDFHexString).decodeText()).toBe("Ryan Olson");
      expect(field.lookup(key("AP"), PDFDict).has(key("N"))).toBe(true);

      const { annotations, operators } = await opensInPdfJs(signed);
      expect(annotations.some((annotation) => annotation.fieldType === "Sig" && annotation.fieldName === "Signature1")).toBe(true);
      expect(operators.fnArray.length).toBeGreaterThan(0);

      const scan = await scanSignatures(signed);
      expect(scan.signatures).toHaveLength(1);
      expect(scan.signatures[0]).toMatchObject({ byteRangeOk: true, coversWholeFile: true, laterRevisions: 0, kind: "approval", fieldName: "Signature1", problems: [] });
    });
  }

  it("keeps an earlier signature's byte range intact when signing again", async () => {
    const input = await makePdf({ objectStreams: true });
    const firstPrepared = await prepareSignature(input, options());
    const first = fill(firstPrepared, "3082aaaa");
    const secondPrepared = await prepareSignature(first, options({ target: { kind: "new", page: 2, rect: [72, 72, 272, 132] }, appearance: null }));
    expect(secondPrepared.fieldName).toBe("Signature2");
    expect(same(secondPrepared.bytes.subarray(0, first.length), first)).toBe(true);
    const second = fill(secondPrepared, "3082bbbb");
    const [, a, b, c] = byteRangeIn(second, firstPrepared.placeholder.contentsAt);
    expect(b + c).toBe(first.length);
    expect(same(second.subarray(0, a), first.subarray(0, a))).toBe(true);
    expect(same(second.subarray(b, b + c), first.subarray(b))).toBe(true);
    expectCoverage(second, secondPrepared.placeholder.contentsAt, secondPrepared.placeholder.contentsLength);
    const scan = await scanSignatures(second);
    expect(scan.signatures.map((signature) => [signature.fieldName, signature.byteRangeOk, signature.coversWholeFile, signature.laterRevisions])).toEqual([
      ["Signature1", true, false, 1],
      ["Signature2", true, true, 0],
    ]);
    await opensInPdfJs(second);
  });

  it("fills an existing empty signature field without adding another", async () => {
    const input = await withEmptyField();
    const prepared = await prepareSignature(input, options({ target: { kind: "field", fieldName: "Approver" } }));
    expect(prepared.fieldName).toBe("Approver");
    const signed = fill(prepared);
    const { doc, value, field } = await signatureValue(signed, "Approver");
    expect(doc.catalog.lookup(key("AcroForm"), PDFDict).lookup(key("Fields"), PDFArray).size()).toBe(1);
    expect(doc.catalog.lookup(key("AcroForm"), PDFDict).lookup(key("SigFlags"), PDFNumber).asNumber()).toBe(3);
    expect(value.get(key("Type"))).toBe(key("Sig"));
    expect(field.lookup(key("AP"), PDFDict).has(key("N"))).toBe(true);
    expect((await scanSignatures(signed)).signatures).toHaveLength(1);
    await opensInPdfJs(signed);
    await expect(prepareSignature(signed, options({ target: { kind: "field", fieldName: "Approver" } }))).rejects.toThrow("“Approver” is already signed.");
    await expect(prepareSignature(input, options({ target: { kind: "field", fieldName: "Nobody" } }))).rejects.toThrow("There's no signature field named “Nobody”.");
  });

  it("locks the field with a FieldMDP reference", async () => {
    const prepared = await prepareSignature(await makePdf(), options({ lockField: true }));
    const { field, value } = await signatureValue(fill(prepared), "Signature1");
    const lock = field.lookup(key("Lock"), PDFDict);
    expect(lock.get(key("Action"))).toBe(key("Include"));
    expect(lock.lookup(key("Fields"), PDFArray).lookup(0, PDFHexString).decodeText()).toBe("Signature1");
    const reference = value.lookup(key("Reference"), PDFArray).lookup(0, PDFDict);
    expect(reference.get(key("TransformMethod"))).toBe(key("FieldMDP"));
    expect(reference.lookup(key("TransformParams"), PDFDict).lookup(key("Fields"), PDFArray).lookup(0, PDFHexString).decodeText()).toBe("Signature1");
  });

  it("honors a lock the field's author prepared", async () => {
    const input = await withEmptyField((doc, field) => field.set(key("Lock"), doc.context.obj({ Type: "SigFieldLock", Action: "Exclude", Fields: [PDFString.of("Notes")] })));
    const { value } = await signatureValue(fill(await prepareSignature(input, options({ target: { kind: "field", fieldName: "Approver" } }))), "Approver");
    const params = value.lookup(key("Reference"), PDFArray).lookup(0, PDFDict).lookup(key("TransformParams"), PDFDict);
    expect(params.get(key("Action"))).toBe(key("Exclude"));
    expect(params.lookup(key("Fields"), PDFArray).lookup(0, PDFHexString).decodeText()).toBe("Notes");
  });

  it("certifies an unsigned document and refuses to certify a signed one", async () => {
    const prepared = await prepareSignature(await makePdf(), options({ certify: 2 }));
    const signed = fill(prepared);
    const { doc, value } = await signatureValue(signed, "Signature1");
    const valueRef = doc.catalog.lookup(key("AcroForm"), PDFDict).lookup(key("Fields"), PDFArray).lookup(0, PDFDict).get(key("V"));
    expect(doc.catalog.lookup(key("Perms"), PDFDict).get(key("DocMDP"))).toBe(valueRef);
    const reference = value.lookup(key("Reference"), PDFArray).lookup(0, PDFDict);
    expect(reference.get(key("TransformMethod"))).toBe(key("DocMDP"));
    expect(reference.lookup(key("TransformParams"), PDFDict).lookup(key("P"), PDFNumber).asNumber()).toBe(2);
    expect((await scanSignatures(signed)).certified).toBe(2);
    await expect(prepareSignature(signed, options({ certify: 3 }))).rejects.toThrow("Only the first signature can certify a document.");
    const approval = await prepareSignature(signed, options({ target: { kind: "invisible", page: 1 } }));
    expect(approval.fieldName).toBe("Signature2");

    const approved = fill(await prepareSignature(await makePdf(), options()));
    await expect(prepareSignature(approved, options({ certify: 1 }))).rejects.toThrow("already signed");
  });

  it("refuses documents certified to allow no changes", async () => {
    const locked = fill(await prepareSignature(await makePdf(), options({ certify: 1 })));
    await expect(prepareSignature(locked, options())).rejects.toThrow("certified to allow no changes");
  });

  it("writes an invisible signature with a zero rectangle and no appearance", async () => {
    const prepared = await prepareSignature(await makePdf(), options({ target: { kind: "invisible", page: 2 } }));
    const { doc, field } = await signatureValue(fill(prepared), "Signature1");
    expect(field.lookup(key("Rect"), PDFArray).asArray().map((entry) => (entry as PDFNumber).asNumber())).toEqual([0, 0, 0, 0]);
    expect(field.has(key("AP"))).toBe(false);
    expect(doc.getPage(1).node.lookup(key("Annots"), PDFArray).size()).toBe(1);
  });

  it("draws the appearance upright on rotated pages", async () => {
    const prepared = await prepareSignature(await makePdf({ rotate: 90 }), options({ target: { kind: "new", page: 1, rect: [500, 100, 560, 300] } }));
    const signed = fill(prepared);
    const { field } = await signatureValue(signed, "Signature1");
    const stream = field.lookup(key("AP"), PDFDict).lookup(key("N"), PDFRawStream);
    expect(stream.dict.lookup(key("BBox"), PDFArray).asArray().map((entry) => (entry as PDFNumber).asNumber())).toEqual([0, 0, 200, 60]);
    expect(stream.dict.lookup(key("Matrix"), PDFArray).asArray().map((entry) => (entry as PDFNumber).asNumber())).toEqual([0, 1, -1, 0, 60, 0]);
    expect(latin1.decode(decodePDFRawStream(stream).decode())).toMatch(/Tj/);
    await opensInPdfJs(signed);
  });

  it("refuses password-protected, damaged, and out-of-range targets", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.encrypt({ userPassword: "secret", ownerPassword: "owner" });
    await expect(prepareSignature(await doc.save(), options())).rejects.toThrow("Password-protected PDFs can't be signed digitally yet.");
    const input = await makePdf();
    const damaged = new TextEncoder().encode(latin1.decode(input).replace(/startxref\s+\d+/, "startxref\n12"));
    await expect(prepareSignature(damaged, options())).rejects.toThrow("damaged");
    await expect(prepareSignature(input, options({ target: { kind: "new", page: 3, rect: [0, 0, 10, 10] } }))).rejects.toThrow("Page 3 doesn't exist");
    await expect(prepareSignature(input, options({ target: { kind: "new", page: 1, rect: [10, 10, 10, 40] } }))).rejects.toThrow("width and height");
  });
});

describe("prepareDocTimestamp", () => {
  it("adds an invisible document timestamp placeholder", async () => {
    const signedOnce = fill(await prepareSignature(await makePdf({ objectStreams: true }), options()));
    const prepared = await prepareDocTimestamp(signedOnce);
    expect(same(prepared.bytes.subarray(0, signedOnce.length), signedOnce)).toBe(true);
    expectPlaceholder(prepared, signedOnce.length);
    expect(latin1.decode(prepared.bytes.subarray(signedOnce.length))).toMatch(/\d+ 0 obj\n<<\n\/Type \/DocTimeStamp\n/);
    const stamped = fill(prepared, "3082cccc");
    const { value, field } = await signatureValue(stamped, prepared.fieldName);
    expect(value.get(key("SubFilter"))).toBe(key("ETSI.RFC3161"));
    expect(value.has(key("M"))).toBe(false);
    expect(field.has(key("AP"))).toBe(false);
    const scan = await scanSignatures(stamped);
    expect(scan.signatures.map((signature) => [signature.kind, signature.byteRangeOk, signature.coversWholeFile])).toEqual([
      ["approval", true, false],
      ["timestamp", true, true],
    ]);
    await opensInPdfJs(stamped);
  });
});

const blob = (...values: number[]) => new Uint8Array(values);

async function dssArrays(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const dss = doc.catalog.lookup(key("DSS"), PDFDict);
  const read = (name: string) =>
    (dss.lookupMaybe(key(name), PDFArray)?.asArray() ?? []).map((ref) => Array.from(decodePDFRawStream(doc.context.lookup(ref as PDFRef, PDFRawStream)).decode()));
  const vri = dss.lookupMaybe(key("VRI"), PDFDict);
  const vriEntry = (name: string, kind: string) =>
    (vri!.lookup(key(name), PDFDict).lookupMaybe(key(kind), PDFArray)?.asArray() ?? []).map((ref) => Array.from(decodePDFRawStream(doc.context.lookup(ref as PDFRef, PDFRawStream)).decode()));
  return { certs: read("Certs"), ocsps: read("OCSPs"), crls: read("CRLs"), vriEntry, vriKeys: (vri?.keys() ?? []).map((name) => name.decodeText()) };
}

describe("appendDss", () => {
  const material = (patch: Partial<ValidationMaterial>): ValidationMaterial => ({ certs: [], ocsps: [], crls: [], vri: {}, problems: [], ...patch });

  it("creates a DSS and merges later additions, deduped by bytes", async () => {
    const signed = fill(await prepareSignature(await makePdf({ objectStreams: true }), options()));
    const first = await appendDss(signed, material({ certs: [blob(1, 1), blob(2, 2)], ocsps: [blob(3)], vri: { abcd: { certs: [0, 1], ocsps: [0], crls: [] } } }));
    expect(same(first.subarray(0, signed.length), signed)).toBe(true);
    const once = await dssArrays(first);
    expect(once.certs).toEqual([[1, 1], [2, 2]]);
    expect(once.ocsps).toEqual([[3]]);
    expect(once.crls).toEqual([]);
    expect(once.vriKeys).toEqual(["ABCD"]);
    expect(once.vriEntry("ABCD", "Cert")).toEqual([[1, 1], [2, 2]]);

    const second = await appendDss(first, material({ certs: [blob(2, 2), blob(4)], crls: [blob(5)], vri: { ABCD: { certs: [1], ocsps: [], crls: [0] }, EF01: { certs: [0], ocsps: [], crls: [] } } }));
    expect(same(second.subarray(0, first.length), first)).toBe(true);
    const twice = await dssArrays(second);
    expect(twice.certs).toEqual([[1, 1], [2, 2], [4]]);
    expect(twice.crls).toEqual([[5]]);
    expect(twice.vriKeys.sort()).toEqual(["ABCD", "EF01"]);
    expect(twice.vriEntry("ABCD", "Cert")).toEqual([[1, 1], [2, 2], [4]]);
    expect(twice.vriEntry("ABCD", "OCSP")).toEqual([[3]]);
    expect(twice.vriEntry("ABCD", "CRL")).toEqual([[5]]);
    expect(twice.vriEntry("EF01", "Cert")).toEqual([[2, 2]]);

    const scan = await scanSignatures(second);
    expect(scan.signatures[0]).toMatchObject({ byteRangeOk: true, coversWholeFile: false, laterRevisions: 2 });
    expect(scan.dss?.certs).toHaveLength(3);
    await opensInPdfJs(second);
  });

  it("keeps a DSS that was written by a classic xref update and leaves files alone when there's nothing to add", async () => {
    const input = await makePdf();
    expect(await appendDss(input, material({}))).toBe(input);
    const updated = await appendDss(input, material({ certs: [blob(9)] }));
    expect(latin1.decode(updated.subarray(input.length))).toMatch(/\nxref\n/);
    expect((await dssArrays(updated)).certs).toEqual([[9]]);
    await opensInPdfJs(updated);
  });
});

describe("helpers", () => {
  it("formats signing times as PDF dates", () => {
    expect(pdfDate("2026-11-11T14:03:00-06:00")).toBe("D:20261111140300-06'00'");
    expect(pdfDate("2026-11-11T20:03:05.123Z")).toBe("D:20261111200305Z");
    expect(pdfDate("2026-11-11T14:03")).toBe("D:20261111140300");
    expect(() => pdfDate("yesterday")).toThrow("valid date");
  });

  it("keeps appearance text in WinAnsi", () => {
    expect(winAnsiLine("Ryan Ølson ✓ — café")).toBe("Ryan Ølson ? — café");
    expect(winAnsiLine("Ŝign\nhere")).toBe("Sign here");
  });

  it("lays the outline beside wide text and above tall text", () => {
    const wide = splitBox(300, 60, true, true);
    expect(wide.outline!.x).toBeLessThan(wide.text!.x);
    const tall = splitBox(120, 120, true, true);
    expect(tall.outline!.y).toBeGreaterThan(tall.text!.y);
    expect(rotationMatrix(180, 10, 20)).toEqual([-1, 0, 0, -1, 10, 20]);
  });
});
