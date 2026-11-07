import { describe, expect, it, vi } from "vitest";
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFStream, PDFString, StandardFonts } from "@cantoo/pdf-lib";
import { getDocument, PasswordException } from "pdfjs-dist/legacy/build/pdf.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPageEdit, decryptPdf, encryptPdf, runPageEditJob } from "../src/lib/pageEdits";
import { passwordRole } from "../src/lib/pdfDecrypt";
import { writeStickyNotes } from "../src/lib/notesPdf";
import { bytesForDisk, hasEncryptEntry } from "../src/lib/protection";
import type { StickyNote } from "../src/lib/notes";

Promise.withResolvers ??= <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const buffers = ArrayBuffer.prototype as ArrayBuffer & { transferToFixedLength?: (length?: number) => ArrayBuffer };
buffers.transferToFixedLength ??= function (this: ArrayBuffer, length = this.byteLength) {
  const copy = new ArrayBuffer(length);
  new Uint8Array(copy).set(new Uint8Array(this, 0, Math.min(length, this.byteLength)));
  return copy;
};

const standardFontDataUrl = new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).pathname;

const latin1 = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

const open = (bytes: Uint8Array, password?: string) =>
  getDocument({ data: bytes.slice(), password, standardFontDataUrl, isEvalSupported: false, verbosity: 0 }).promise;

async function fixture(useObjectStreams = true) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 2; index += 1) {
    const page = doc.addPage([600, 800]);
    page.drawText(`Page ${index + 1} (draft) \\ copy`, { x: 50, y: 750, size: 12, font });
    doc.getForm().createTextField(`field${index}`).addToPage(page, { x: 50, y: 700, width: 200, height: 24 });
    doc.getForm().getTextField(`field${index}`).setText(`value ${index}`);
    const square = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Square", Rect: [100, 100, 200, 200], F: 4, Contents: PDFString.of(`box ${index}`) }));
    page.node.set(PDFName.of("Annots"), doc.context.obj([...(page.node.Annots()?.asArray() ?? []), square]));
  }
  doc.catalog.set(PDFName.of("PageLabels"), doc.context.obj({ Nums: [0, { S: "r" }] }));
  doc.setTitle("Résumé (final) \\ ünïcode");
  return doc.save({ useObjectStreams });
}

async function encryptedFixture(password = "secret", useObjectStreams = true) {
  const doc = await PDFDocument.load(await fixture(useObjectStreams));
  doc.encrypt({ userPassword: password, ownerPassword: password });
  return doc.save({ useObjectStreams });
}

async function contents(bytes: Uint8Array, password?: string) {
  const doc = await open(bytes, password);
  const pages = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const text = (await page.getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join("");
    const annotations = await page.getAnnotations();
    pages.push({
      text,
      fields: annotations.filter((annotation) => annotation.subtype === "Widget").map((widget) => widget.fieldValue),
      squares: annotations.filter((annotation) => annotation.subtype === "Square").map((square) => square.contentsObj.str),
    });
  }
  const { info } = await doc.getMetadata();
  return { pages, labels: await doc.getPageLabels(), title: (info as { Title?: string }).Title };
}

const infoOf = (doc: PDFDocument) => doc.context.lookup(doc.context.trailerInfo.Info, PDFDict);

const refusesWithout = async (bytes: Uint8Array, password?: string) => {
  await expect(open(bytes, password)).rejects.toBeInstanceOf(PasswordException);
};

describe("hasEncryptEntry", () => {
  it("reads classic trailers and cross-reference streams", async () => {
    expect(hasEncryptEntry(await fixture(false))).toBe(false);
    expect(hasEncryptEntry(await fixture(true))).toBe(false);
    expect(hasEncryptEntry(await encryptedFixture("secret", false))).toBe(true);
    expect(hasEncryptEntry(await encryptedFixture("secret", true))).toBe(true);
  });

  it("reads the newest section of an incrementally updated file", async () => {
    const doc = await open(await encryptedFixture(), "secret");
    const widget = (await (await doc.getPage(1)).getAnnotations()).find((annotation) => annotation.subtype === "Widget")!;
    doc.annotationStorage.setValue(widget.id, { value: "typed" });
    const saved = await doc.saveDocument();
    expect(hasEncryptEntry(saved)).toBe(true);
    expect(hasEncryptEntry(await fixture())).toBe(false);
  });

  it("can't tell when there's no usable cross-reference offset", () => {
    expect(hasEncryptEntry(new TextEncoder().encode("not a pdf"))).toBeNull();
    expect(hasEncryptEntry(new TextEncoder().encode("%PDF-1.7\nstartxref\n999999\n%%EOF"))).toBeNull();
  });
});

describe("password protection", () => {
  it("protects a plain file so only the password opens it, with nothing lost", async () => {
    const plain = await fixture();
    const before = await contents(plain);
    const unchanged = await applyPageEdit(plain, { kind: "protect", password: "open sesame" });
    const saved = await encryptPdf(unchanged, "open sesame");
    expect(hasEncryptEntry(saved)).toBe(true);
    await refusesWithout(saved);
    await refusesWithout(saved, "wrong");
    expect(await contents(saved, "open sesame")).toEqual(before);
    expect(before.labels).toEqual(["i", "ii"]);
    expect(before.pages[0].fields).toEqual(["value 0"]);
  });

  it("removes a password, leaving no encryption dictionary behind", async () => {
    const removed = await applyPageEdit(await encryptedFixture(), { kind: "protect", password: null }, "secret");
    expect(hasEncryptEntry(removed)).toBe(false);
    expect(latin1(removed)).not.toMatch(/\/Encrypt\b/);
    expect((await PDFDocument.load(removed)).isEncrypted).toBe(false);
    expect(await contents(removed)).toEqual(await contents(await fixture()));
  });

  it("removes a password from a file with a classic cross-reference table", async () => {
    const removed = await applyPageEdit(await encryptedFixture("secret", false), { kind: "protect", password: null }, "secret");
    expect(latin1(removed)).not.toMatch(/\/Encrypt\b/);
    expect((await PDFDocument.load(removed)).isEncrypted).toBe(false);
  });

  it("encrypts strings that sit in stream dictionaries", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const stream = doc.context.flateStream("payload", { Note: PDFString.of("hidden note"), Nested: { Inner: PDFHexString.fromText("hidden inner") } });
    doc.catalog.set(PDFName.of("Extra"), doc.context.register(stream));
    const written = await encryptPdf(await doc.save(), "pw");
    expect(latin1(written)).not.toContain("hidden");
    const decrypted = await PDFDocument.load(await decryptPdf(written, "pw"));
    const dict = decrypted.catalog.lookup(PDFName.of("Extra"), PDFStream).dict;
    expect(dict.lookup(PDFName.of("Note"), PDFString, PDFHexString).decodeText()).toBe("hidden note");
    expect(dict.lookup(PDFName.of("Nested"), PDFDict).lookup(PDFName.of("Inner"), PDFString, PDFHexString).decodeText()).toBe("hidden inner");
  });

  it("keeps the document's title and other info when decrypting", async () => {
    const decrypted = await PDFDocument.load(await decryptPdf(await encryptedFixture(), "secret"));
    expect(decrypted.getTitle()).toBe("Résumé (final) \\ ünïcode");
  });

  it("changes a password", async () => {
    const locked = await encryptedFixture("old");
    const changed = await encryptPdf(await applyPageEdit(locked, { kind: "protect", password: "new" }, "old"), "new");
    await refusesWithout(changed, "old");
    expect((await contents(changed, "new")).pages).toHaveLength(2);
  });

  it("keeps page edits on protected files plain until they're written", async () => {
    const locked = await encryptedFixture();
    const edited = await applyPageEdit(locked, { kind: "rotate", pages: [0], by: 90 }, "secret");
    expect(hasEncryptEntry(edited)).toBe(false);
    const written = await encryptPdf(edited, "secret");
    await refusesWithout(written);
    const reopened = await open(written, "secret");
    expect((await reopened.getPage(1)).rotate).toBe(90);
  });

  it("loads pdf.js's incremental save of an encrypted file with its password", async () => {
    const doc = await open(await encryptedFixture(), "secret");
    const widget = (await (await doc.getPage(1)).getAnnotations()).find((annotation) => annotation.subtype === "Widget")!;
    doc.annotationStorage.setValue(widget.id, { value: "typed (in) \\ pdf.js" });
    const saved = await doc.saveDocument();
    const decrypted = await decryptPdf(saved, "secret");
    expect((await contents(decrypted)).pages[0].fields).toEqual(["typed (in) \\ pdf.js"]);
  });

  it("keeps sticky notes written into an encrypted file through encrypt and decrypt", async () => {
    const note: StickyNote = { id: "note-1", pageIndex: 1, rect: [100, 480, 120, 500], text: "Check (this) \\ ✓", color: [255, 214, 61], date: "D:20261106090000Z", fresh: true, deleted: false };
    const withNote = await writeStickyNotes(await encryptedFixture(), [note], "secret");
    const roundTrip = await decryptPdf(await encryptPdf(withNote, "secret"), "secret");
    const annotations = await (await (await open(roundTrip)).getPage(2)).getAnnotations();
    expect(annotations.find((annotation) => annotation.subtype === "Text")?.contentsObj.str).toBe("Check (this) \\ ✓");
  });

  it("round-trips literal strings with parentheses, backslashes, and non-ASCII bytes", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setSubject("plain");
    infoOf(doc).set(PDFName.of("Raw"), PDFString.of("a(b)c\\\\déÿ"));
    infoOf(doc).set(PDFName.of("Hex"), PDFHexString.fromText("Grüße (x) \\ ✓"));
    doc.encrypt({ userPassword: "pw", ownerPassword: "pw" });
    const once = await decryptPdf(await doc.save(), "pw");
    const twice = await decryptPdf(await encryptPdf(once, "pw"), "pw");
    const info = infoOf(await PDFDocument.load(twice));
    expect(info.lookup(PDFName.of("Raw"), PDFString, PDFHexString).decodeText()).toBe("a(b)c\\déÿ");
    expect(info.lookup(PDFName.of("Hex"), PDFString, PDFHexString).decodeText()).toBe("Grüße (x) \\ ✓");
  });
});

const hasQpdf = (() => {
  try {
    execFileSync("qpdf", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function qpdf(input: Uint8Array, args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "clumsy-qpdf-"));
  writeFileSync(join(dir, "in.pdf"), input);
  execFileSync("qpdf", [...args, "--", join(dir, "in.pdf"), join(dir, "out.pdf")]);
  return new Uint8Array(readFileSync(join(dir, "out.pdf")));
}

function linearizedLike(encrypted: boolean) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  const offsetOf = () => encoder.encode(parts.join("")).length;
  parts.push("%PDF-1.7\n");
  const firstXref = offsetOf();
  parts.push(`xref\n0 2\n${"0000000000 65535 f \n"}${"0000000200 00000 n \n"}trailer\n<< /Size 3 /Root 1 0 R ${encrypted ? "/Encrypt 2 0 R " : ""}/Prev 400 >>\nstartxref\n0\n%%EOF\n`);
  parts.push("1 0 obj\n<< /Type /Catalog >>\nendobj\n");
  parts.push(`xref\n0 1\n${"0000000000 65535 f \n"}trailer\n<< /Size 3 >>\nstartxref\n${firstXref}\n%%EOF\n`);
  return encoder.encode(parts.join(""));
}

describe("hasEncryptEntry on linearized files", () => {
  it("reads the trailer of the section startxref points at, not the last one in the file", () => {
    expect(hasEncryptEntry(linearizedLike(true))).toBe(true);
    expect(hasEncryptEntry(linearizedLike(false))).toBe(false);
  });

  it.skipIf(!hasQpdf)("reads qpdf's linearized output", async () => {
    const plain = await fixture();
    expect(hasEncryptEntry(qpdf(plain, ["--linearize", "--object-streams=disable", "--encrypt", "pw", "pw", "256"]))).toBe(true);
    expect(hasEncryptEntry(qpdf(plain, ["--linearize", "--encrypt", "pw", "pw", "256"]))).toBe(true);
    expect(hasEncryptEntry(qpdf(plain, ["--linearize", "--object-streams=disable"]))).toBe(false);
  });
});

describe("strings outside object streams", () => {
  it("encrypts catalog, page, and direct annotation strings so other readers decode them", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    doc.catalog.set(PDFName.of("PageLabels"), doc.context.obj({ Nums: [0, { S: "D", P: PDFString.of("Intro-") }] }));
    doc.catalog.set(PDFName.of("Lang"), PDFString.of("en-US"));
    const note = doc.context.obj({ Type: "Annot", Subtype: "Square", Rect: [10, 10, 50, 50], F: 4, Contents: PDFString.of("direct (note) \\\\ ok") });
    doc.getPage(0).node.set(PDFName.of("Annots"), doc.context.obj([note]));
    const written = await encryptPdf(await doc.save(), "pw");
    expect(latin1(written)).not.toContain("Intro-");
    expect(latin1(written)).not.toContain("en-US");
    const opened = await open(written, "pw");
    expect(await opened.getPageLabels()).toEqual(["Intro-1", "Intro-2"]);
    const square = (await (await opened.getPage(1)).getAnnotations()).find((annotation) => annotation.subtype === "Square");
    expect(square?.contentsObj.str).toBe("direct (note) \\ ok");
  });
});

describe("passwordRole", () => {
  for (const algorithm of ["AES-256", "AES-128", "RC4-128"] as const) {
    it(`tells the user password from the owner password (${algorithm})`, async () => {
      const doc = await PDFDocument.create();
      doc.addPage();
      doc.encrypt({ userPassword: "user", ownerPassword: "owner", algorithm, allowWeakCryptography: true });
      const bytes = await doc.save();
      expect(await passwordRole(bytes, "user")).toBe("user");
      expect(await passwordRole(bytes, "owner")).toBe("owner");
    });
  }

  it("has nothing to say about plain files", async () => {
    expect(await passwordRole(await fixture(), "anything")).toBeNull();
  });

  it.skipIf(!hasQpdf)("works on qpdf's AES-256 output", async () => {
    const bytes = qpdf(await fixture(), ["--encrypt", "user", "owner", "256"]);
    expect(await passwordRole(bytes, "user")).toBe("user");
    expect(await passwordRole(bytes, "owner")).toBe("owner");
  });
});

describe("protect edits", () => {
  it("report plain bytes as unchanged so only the tab's protection changes", async () => {
    const plain = await fixture();
    expect((await runPageEditJob({ op: "edit", bytes: plain, edit: { kind: "protect", password: "pw" } })).unchanged).toBe(true);
    const locked = await encryptedFixture();
    const removed = await runPageEditJob({ op: "edit", bytes: locked, edit: { kind: "protect", password: null }, password: "secret" });
    expect(removed.unchanged).toBe(false);
    expect(hasEncryptEntry(removed.bytes)).toBe(false);
  });

  it("decrypt owner-only files even when the cross-reference check can't tell", async () => {
    const doc = await PDFDocument.load(await fixture());
    doc.encrypt({ ownerPassword: "owner", permissions: { printing: false } });
    const removed = await runPageEditJob({ op: "edit", bytes: await doc.save(), edit: { kind: "protect", password: "new" } });
    expect(removed.unchanged).toBe(false);
    expect((await PDFDocument.load(removed.bytes)).isEncrypted).toBe(false);
  });
});

describe("bytesForDisk", () => {
  it("only encrypts protected tabs whose bytes aren't encrypted yet", async () => {
    const encrypt = vi.fn(async (bytes: Uint8Array, password: string) => encryptPdf(bytes, password));
    const plain = await fixture();
    const locked = await encryptedFixture();
    expect(await bytesForDisk(plain, undefined, encrypt)).toBe(plain);
    expect(await bytesForDisk(locked, { password: "secret" }, encrypt)).toBe(locked);
    expect(encrypt).not.toHaveBeenCalled();
    const written = await bytesForDisk(plain, { password: "secret" }, encrypt);
    expect(encrypt).toHaveBeenCalledWith(plain, "secret");
    await refusesWithout(written);
    expect(latin1(written)).not.toContain("secret");
  });
});
