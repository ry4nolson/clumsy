#!/usr/bin/env node
// Generates the performance and hostile-file fixtures for the hardening pass (docs/hardening-plan.md).
// Usage: node scripts/fixtures.mjs [out-dir]   (default ~/Documents/clumsy-fixtures; never inside the repo)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFString,
  StandardFonts,
  rgb,
} from "@cantoo/pdf-lib";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] ?? join(homedir(), "Documents", "clumsy-fixtures"));
if (!relative(repo, out).startsWith("..")) {
  console.error(`Refusing to write fixtures inside the repo: ${out}`);
  process.exit(1);
}

const WORDS = (
  "the of and to in is that for it as with was on be by this are from or at an which not have has but were " +
  "document page viewer render annotation signature field outline structure stream object reference catalog " +
  "highlight comment compare selection thumbnail rotation label history version window pane folder export"
).split(" ");

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sentence(next, length) {
  const words = [];
  while (words.join(" ").length < length) {
    words.push(WORDS[Math.floor(next() * WORDS.length)]);
  }
  return words.join(" ");
}

function png(width, height, channels, fill) {
  const stride = width * channels + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    fill(raw.subarray(y * stride + 1, (y + 1) * stride), y);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 1 ? 0 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function scanImage(seed) {
  const next = random(seed);
  const width = 2550;
  const height = 3300;
  const ink = new Uint8Array(width * height);
  for (let top = 300; top < height - 300; top += 62) {
    let x = 250 + Math.floor(next() * 40);
    while (x < width - 450) {
      const word = 40 + Math.floor(next() * 170);
      for (let y = top; y < top + 30; y++) {
        ink.fill(1, y * width + x, y * width + x + word);
      }
      x += word + 22 + Math.floor(next() * 12);
    }
  }
  return png(width, height, 1, (row, y) => {
    for (let x = 0; x < width; x++) {
      const base = ink[y * width + x] ? 45 : 232;
      row[x] = base + Math.floor(next() * 6) - 3;
    }
  });
}

function jpeg(pngBytes, name) {
  const temp = join(out, `.${name}.png`);
  const target = join(out, `.${name}.jpg`);
  writeFileSync(temp, pngBytes);
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "60", temp, "--out", target], { stdio: "ignore" });
  const bytes = readFileSync(target);
  rmSync(temp);
  rmSync(target);
  return bytes;
}

async function textDocument(pages, seed = 1) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const next = random(seed);
  for (let index = 0; index < pages; index++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Section ${index + 1}: ${sentence(next, 30)}`, { x: 54, y: 740, size: 14, font: bold });
    for (let line = 0; line < 52; line++) {
      page.drawText(sentence(next, 95), { x: 54, y: 712 - line * 12.5, size: 9.5, font });
    }
    page.drawText(`${index + 1}`, { x: 300, y: 30, size: 9, font });
  }
  return doc;
}

async function scannedDocument(pages) {
  const variants = Array.from({ length: 6 }, (_, index) => jpeg(scanImage(index + 7), `scan-${index}`));
  const doc = await PDFDocument.create();
  for (let index = 0; index < pages; index++) {
    const image = await doc.embedJpg(variants[index % variants.length]);
    const page = doc.addPage([612, 792]);
    page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  }
  return doc;
}

async function formDocument(pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  for (let index = 0; index < pages; index++) {
    const page = doc.addPage([612, 792]);
    const name = (field) => `p${index + 1}.${field}`;
    page.drawText(`Application form, page ${index + 1}`, { x: 54, y: 740, size: 14, font });
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 2; column++) {
        const x = 54 + column * 260;
        const y = 690 - row * 52;
        page.drawText(`Field ${row * 2 + column + 1}`, { x, y: y + 22, size: 8, font });
        const field = form.createTextField(name(`text${row * 2 + column + 1}`));
        if (row === 0 && column === 0) {
          field.enableRequired();
        }
        field.addToPage(page, { x, y, width: 230, height: 18, font });
      }
    }
    for (let box = 0; box < 4; box++) {
      page.drawText(`Option ${box + 1}`, { x: 76 + box * 120, y: 252, size: 9, font });
      form.createCheckBox(name(`check${box + 1}`)).addToPage(page, { x: 54 + box * 120, y: 248, width: 14, height: 14 });
    }
    const radio = form.createRadioGroup(name("choice"));
    ["yes", "no", "maybe"].forEach((option, position) => {
      page.drawText(option, { x: 76 + position * 120, y: 202, size: 9, font });
      radio.addOptionToPage(option, page, { x: 54 + position * 120, y: 198, width: 14, height: 14 });
    });
    const dropdown = form.createDropdown(name("state"));
    dropdown.setOptions(["Texas", "Oklahoma", "Louisiana", "New Mexico", "Arkansas"]);
    dropdown.addToPage(page, { x: 54, y: 140, width: 200, height: 20, font });
  }
  return doc;
}

async function taggedDocument(pages, mutate) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const context = doc.context;
  const rootRef = context.nextRef();
  const documentRef = context.register(context.obj({ Type: "StructElem", S: "Document", P: rootRef, K: [] }));
  const nums = [];
  const refs = { rootRef, documentRef, figures: [] };
  for (let index = 0; index < pages; index++) {
    const page = doc.addPage([612, 792]);
    page.node.set(PDFName.of("StructParents"), context.obj(index));
    page.pushOperators(PDFOperator.of("BDC", [PDFName.of("P"), context.obj({ MCID: 0 })]));
    page.drawText(`Tagged paragraph on page ${index + 1}.`, { x: 54, y: 700, size: 12, font });
    page.pushOperators(PDFOperator.of("EMC"));
    page.pushOperators(PDFOperator.of("BDC", [PDFName.of("Figure"), context.obj({ MCID: 1 })]));
    page.drawRectangle({ x: 54, y: 450, width: 300, height: 200, color: rgb(0.4, 0.6, 0.8) });
    page.pushOperators(PDFOperator.of("EMC"));
    const paragraph = context.register(context.obj({ Type: "StructElem", S: "P", P: documentRef, Pg: page.ref, K: 0 }));
    const figure = context.register(
      context.obj({ Type: "StructElem", S: "Figure", P: documentRef, Pg: page.ref, K: 1, Alt: PDFHexString.fromText(`Blue box on page ${index + 1}`) }),
    );
    refs.figures.push(figure);
    context.lookup(documentRef, PDFDict).lookup(PDFName.of("K"), PDFArray).push(paragraph, figure);
    nums.push(index, context.obj([paragraph, figure]));
  }
  context.assign(rootRef, context.obj({ Type: "StructTreeRoot", K: documentRef, ParentTree: context.obj({ Nums: nums }), ParentTreeNextKey: pages }));
  doc.catalog.set(PDFName.of("StructTreeRoot"), rootRef);
  doc.catalog.set(PDFName.of("MarkInfo"), context.obj({ Marked: true }));
  mutate?.(doc, refs);
  return doc;
}

function markdownDocument(targetBytes) {
  const next = random(3);
  const sections = [];
  let size = 0;
  for (let index = 1; size < targetBytes; index++) {
    const section = [
      `## Section ${index}: ${sentence(next, 30)}`,
      "",
      sentence(next, 600),
      "",
      `![Figure ${index}](images/figure-${(index % 3) + 1}.png)`,
      "",
      "```ts",
      `export function section${index}(value: number): number {`,
      `  return value * ${index} + ${Math.floor(next() * 100)};`,
      "}",
      "```",
      "",
      "| Column | Value | Notes |",
      "|---|---:|---|",
      ...Array.from({ length: 5 }, (_, row) => `| ${row + 1} | ${Math.floor(next() * 1000)} | ${sentence(next, 30)} |`),
      "",
      `- [x] ${sentence(next, 40)}`,
      `- [ ] ${sentence(next, 40)}`,
      "",
      `See [section ${Math.max(1, index - 1)}](#section-${Math.max(1, index - 1)}) and [the spec](https://example.com/spec/${index}).`,
      "",
    ].join("\n");
    sections.push(section);
    size += Buffer.byteLength(section);
  }
  return `# Markdown stress test\n\n${sections.join("\n")}`;
}

async function save(doc, name, options = {}) {
  const bytes = await doc.save({ useObjectStreams: false, ...options });
  return write(name, bytes);
}

function write(name, bytes) {
  const path = join(out, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  console.log(`${name.padEnd(36)} ${(bytes.length / 1024 / 1024).toFixed(1).padStart(7)} MB`);
  return bytes;
}

function pagesRoot(doc) {
  return { ref: doc.catalog.get(PDFName.of("Pages")), dict: doc.catalog.lookup(PDFName.of("Pages"), PDFDict) };
}

async function hostile() {
  const base = await textDocument(20, 9);
  const classic = await save(base, "hostile/classic-xref.pdf");
  await save(await textDocument(20, 9), "hostile/object-streams.pdf", { useObjectStreams: true });

  write("hostile/truncated.pdf", classic.subarray(0, Math.floor(classic.length * 0.6)));
  const text = Buffer.from(classic).toString("latin1");
  write("hostile/wrong-startxref.pdf", Buffer.from(text.replace(/startxref\s+\d+/, "startxref\n999999999"), "latin1"));
  write("hostile/no-xref.pdf", Buffer.from(`${text.slice(0, text.lastIndexOf("xref"))}%%EOF\n`, "latin1"));
  const junk = Buffer.from(Array.from({ length: 2048 }, (_, index) => (index * 37) % 256));
  write("hostile/junk-after-eof.pdf", Buffer.concat([classic, Buffer.from("\n"), junk]));

  const cyclicKids = await textDocument(3);
  const kidsRoot = pagesRoot(cyclicKids);
  kidsRoot.dict.lookup(PDFName.of("Kids"), PDFArray).push(kidsRoot.ref);
  await save(cyclicKids, "hostile/cyclic-kids.pdf");

  const cyclicParent = await textDocument(3);
  const parentRoot = pagesRoot(cyclicParent);
  const kids = parentRoot.dict.lookup(PDFName.of("Kids"), PDFArray);
  const firstPage = kids.get(0);
  const middle = cyclicParent.context.register(cyclicParent.context.obj({ Type: "Pages", Kids: [firstPage], Count: 1, Parent: parentRoot.ref }));
  cyclicParent.context.lookup(firstPage, PDFDict).set(PDFName.of("Parent"), middle);
  kids.set(0, middle);
  parentRoot.dict.set(PDFName.of("Parent"), middle);
  await save(cyclicParent, "hostile/cyclic-parent.pdf");

  const deep = await textDocument(3);
  const deepRoot = pagesRoot(deep);
  const leaves = deepRoot.dict.lookup(PDFName.of("Kids"), PDFArray).asArray();
  let parent = deepRoot.ref;
  let parentDict = deepRoot.dict;
  for (let level = 0; level < 1000; level++) {
    const node = deep.context.obj({ Type: "Pages", Kids: [], Count: leaves.length, Parent: parent });
    const ref = deep.context.register(node);
    parentDict.set(PDFName.of("Kids"), deep.context.obj([ref]));
    parent = ref;
    parentDict = node;
  }
  parentDict.set(PDFName.of("Kids"), deep.context.obj(leaves));
  leaves.forEach((leaf) => deep.context.lookup(leaf, PDFDict).set(PDFName.of("Parent"), parent));
  await save(deep, "hostile/deep-page-tree.pdf");

  const empty = await PDFDocument.create();
  await save(empty, "hostile/zero-pages.pdf");

  const sizes = await textDocument(3);
  sizes.getPage(0).setMediaBox(0, 0, 200000, 200000);
  sizes.getPage(1).setMediaBox(0, 0, 1, 1);
  sizes.getPage(2).setMediaBox(0, 0, 14400, 72);
  await save(sizes, "hostile/extreme-page-sizes.pdf");

  await save(
    await taggedDocument(3, (doc, refs) => {
      doc.context.lookup(refs.figures[0], PDFDict).set(PDFName.of("K"), refs.documentRef);
      doc.context.lookup(refs.figures[1], PDFDict).set(PDFName.of("P"), refs.figures[1]);
    }),
    "hostile/cyclic-struct-tree.pdf",
  );

  const names = await textDocument(3);
  const destsRef = names.context.nextRef();
  names.context.assign(destsRef, names.context.obj({ Kids: [destsRef] }));
  names.catalog.set(PDFName.of("Names"), names.context.obj({ Dests: destsRef }));
  await save(names, "hostile/cyclic-name-tree.pdf");

  const outline = await textDocument(3);
  const outlinesRef = outline.context.nextRef();
  const firstRef = outline.context.nextRef();
  const secondRef = outline.context.nextRef();
  const firstPageRef = outline.getPage(0).ref;
  outline.context.assign(outlinesRef, outline.context.obj({ Type: "Outlines", First: firstRef, Last: secondRef, Count: 2 }));
  outline.context.assign(firstRef, outline.context.obj({ Title: PDFString.of("One"), Parent: outlinesRef, Next: secondRef, First: secondRef, Dest: [firstPageRef, "Fit"] }));
  outline.context.assign(secondRef, outline.context.obj({ Title: PDFString.of("Two"), Parent: firstRef, Prev: firstRef, Next: firstRef, Dest: [firstPageRef, "Fit"] }));
  outline.catalog.set(PDFName.of("Outlines"), outlinesRef);
  await save(outline, "hostile/cyclic-outline.pdf");

  const fields = await PDFDocument.create();
  const fieldPage = fields.addPage([612, 792]);
  fields.getForm().createTextField("parent").addToPage(fieldPage, { x: 54, y: 700, width: 200, height: 20 });
  const fieldRef = fields.getForm().getTextField("parent").ref;
  const childRef = fields.context.register(fields.context.obj({ T: PDFString.of("child"), Parent: fieldRef, Kids: [fieldRef] }));
  fields.context.lookup(fieldRef, PDFDict).lookup(PDFName.of("Kids"), PDFArray).push(childRef);
  await save(fields, "hostile/cyclic-fields.pdf", { updateFieldAppearances: false });

  const annots = await textDocument(2);
  const annotPage = annots.getPage(0);
  const popupRef = annots.context.nextRef();
  const noteRef = annots.context.nextRef();
  annots.context.assign(popupRef, annots.context.obj({ Type: "Annot", Subtype: "Popup", Rect: [300, 600, 500, 700], Parent: popupRef }));
  annots.context.assign(noteRef, annots.context.obj({ Type: "Annot", Subtype: "Text", Rect: [100, 600, 120, 620], Contents: PDFString.of("Self reply"), Popup: popupRef, IRT: noteRef, P: annotPage.ref }));
  const badLink = annots.context.register(annots.context.obj({ Type: "Annot", Subtype: "Link", Rect: [54, 500, 300, 520], Dest: [annots.context.obj({ Not: "a page" }), "XYZ", 0, 0, 0] }));
  const missingLink = annots.context.register(annots.context.obj({ Type: "Annot", Subtype: "Link", Rect: [54, 470, 300, 490], A: { S: "GoTo", D: PDFString.of("missing") } }));
  annotPage.node.set(PDFName.of("Annots"), annots.context.obj([noteRef, popupRef, badLink, missingLink]));
  await save(annots, "hostile/annotation-cycles.pdf");

  const huge = await PDFDocument.create();
  const next = random(11);
  const image = await huge.embedPng(png(6000, 6000, 1, (row) => {
    for (let x = 0; x < row.length; x++) {
      row[x] = Math.floor(next() * 256);
    }
  }));
  huge.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  await save(huge, "hostile/huge-image.pdf");

  let incremental = classic;
  for (let update = 1; update <= 2; update++) {
    const doc = await PDFDocument.load(incremental, { forIncrementalUpdate: true });
    doc.getPage(0).drawText(`Incremental update ${update}`, { x: 54, y: 60 + update * 14, size: 10 });
    incremental = await doc.commit();
  }
  write("hostile/incremental-twice.pdf", incremental);
}

async function main() {
  mkdirSync(out, { recursive: true });
  console.log(`Writing fixtures to ${out}`);

  await save(await textDocument(1200), "text-1200.pdf", { useObjectStreams: true });
  await save(await scannedDocument(300), "scanned-300.pdf");
  await save(await formDocument(25), "form-550.pdf");
  await save(await taggedDocument(20), "tagged-20.pdf");

  const dense = await textDocument(20, 5);
  dense.getPages().forEach((page) => {
    const annots = Array.from({ length: 250 }, (_, index) =>
      dense.context.register(
        dense.context.obj({
          Type: "Annot",
          Subtype: "Highlight",
          Rect: [54, 700 - (index % 52) * 12.5, 400, 712 - (index % 52) * 12.5],
          QuadPoints: [54, 712 - (index % 52) * 12.5, 400, 712 - (index % 52) * 12.5, 54, 700 - (index % 52) * 12.5, 400, 700 - (index % 52) * 12.5],
          C: [1, 0.9, 0.2],
          Contents: PDFString.of(`Highlight ${index + 1}`),
        }),
      ),
    );
    page.node.set(PDFName.of("Annots"), dense.context.obj(annots));
  });
  await save(dense, "annotations-5000.pdf");

  const locked = await textDocument(10, 4);
  locked.encrypt({ userPassword: "clumsy", ownerPassword: "owner" });
  await save(locked, "encrypted-user-password.pdf");
  const restricted = await textDocument(10, 4);
  restricted.encrypt({ ownerPassword: "owner", permissions: { printing: false, modifying: false, copying: false } });
  await save(restricted, "encrypted-owner-only.pdf");

  [1, 2, 3].forEach((index) =>
    write(`images/figure-${index}.png`, png(800, 450, 3, (row, y) => {
      for (let x = 0; x < 800; x++) {
        row.set([(x * index) % 256, (y * 2) % 256, 160], x * 3);
      }
    })),
  );
  write("markdown-2mb.md", Buffer.from(markdownDocument(2 * 1024 * 1024)));

  await hostile();
  write(".harness.js", readFileSync(join(repo, "scripts", "perf-harness.js")));
}

await main();
