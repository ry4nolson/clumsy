import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFString } from "@cantoo/pdf-lib";
import { appendDss, prepareDocTimestamp, prepareSignature } from "../src/lib/pdfSignWrite";
import { scanSignatures } from "../src/lib/pdfSignatures";
import { CONTENTS_HEX_LENGTH, type PrepareSignatureOptions, type PreparedSignature } from "../src/lib/signatureTypes";

async function makePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  doc.addPage([612, 792]);
  return doc.save({ useObjectStreams: false });
}

const options = (rect: [number, number, number, number] = [350, 60, 560, 130]): PrepareSignatureOptions => ({
  target: { kind: "new", page: 1, rect },
  appearance: { outline: null, lines: ["Digitally signed by Pat"] },
  certify: null,
  lockField: true,
  signingTime: "2026-11-11T14:03:00-06:00",
  reason: null,
  location: null,
  name: "Pat",
});

function fill({ bytes, placeholder }: PreparedSignature) {
  const out = bytes.slice();
  const { byteRangeAt, byteRangeLength, contentsAt, contentsLength } = placeholder;
  const gapEnd = contentsAt + contentsLength;
  out.set(new TextEncoder().encode(`[0 ${contentsAt} ${gapEnd} ${out.length - gapEnd}`.padEnd(byteRangeLength - 1, " ") + "]"), byteRangeAt);
  out.set(new TextEncoder().encode("3082abcdef0123".padEnd(CONTENTS_HEX_LENGTH, "0")), contentsAt + 1);
  return out;
}

const signed = async (bytes: Uint8Array, rect?: [number, number, number, number]) => fill(await prepareSignature(bytes, options(rect)));

const material = () => ({ certs: [new Uint8Array([0x30, 1, 2, 3])], ocsps: [], crls: [], vri: {}, problems: [] });

async function overlayText(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { forIncrementalUpdate: true, updateMetadata: false });
  const page = doc.getPage(0);
  const note = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "FreeText", Rect: [72, 600, 400, 640], Contents: PDFString.of("Pay $1,000,000") }));
  const annots = page.node.Annots();
  if (annots) {
    annots.push(note);
  } else {
    page.node.set(PDFName.of("Annots"), doc.context.obj([note]));
  }
  return doc.commit();
}

describe("changes after signing", () => {
  it("doesn't count validation data as a change", async () => {
    const withDss = await appendDss(await signed(await makePdf()), material());
    const [signature] = (await scanSignatures(withDss)).signatures;
    expect(signature.coversWholeFile).toBe(false);
    expect(signature.modifiedAfter).toBe(false);
  });

  it("doesn't count a document timestamp or a second signature as a change", async () => {
    const first = await signed(await makePdf());
    const stamped = fill(await prepareDocTimestamp(first));
    const second = await signed(stamped, [72, 60, 280, 130]);
    const scan = await scanSignatures(second);
    expect(scan.signatures).toHaveLength(3);
    expect(scan.signatures.map((signature) => signature.modifiedAfter)).toEqual([false, false, false]);
  });

  it("counts a new visible annotation as a change", async () => {
    const tampered = await overlayText(await appendDss(await signed(await makePdf()), material()));
    const [signature] = (await scanSignatures(tampered)).signatures;
    expect(signature.modifiedAfter).toBe(true);
  });

  it("counts a changed page as a change", async () => {
    const first = await signed(await makePdf());
    const doc = await PDFDocument.load(first, { forIncrementalUpdate: true, updateMetadata: false });
    doc.getPage(1).setRotation({ type: "degrees", angle: 90 } as never);
    const [signature] = (await scanSignatures(await doc.commit())).signatures;
    expect(signature.modifiedAfter).toBe(true);
  });
});

describe("saving before a second signature", () => {
  it("doesn't count pdf.js's save of an unchanged document as a change", async () => {
    const { openPdf } = await import("./pdfjsNode");
    const first = await signed(await makePdf());
    const pdf = await openPdf(first);
    const saved = await pdf.saveDocument();
    const [signature] = (await scanSignatures(saved)).signatures;
    expect(signature.modifiedAfter).toBe(false);
  });
});
