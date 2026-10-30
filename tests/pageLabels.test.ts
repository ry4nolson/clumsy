import { describe, expect, it } from "vitest";
import { PDFDocument, PDFHexString, PDFName, PDFNumber } from "@cantoo/pdf-lib";
import { applyPageEdit, combinePdfs, extractPages } from "../src/lib/pageEdits";
import { encodePageLabels, formatNumber, hasCustomLabels, labelsFromRanges, pageFromInput, pageLabelOf } from "../src/lib/pageLabels";
import { readPageLabels, writePageLabels } from "../src/lib/pdfPageLabels";

const book = ["Cover", "i", "ii", "iii", "iv", "1", "2", "3", "A-1", "A-2", "A-3"];

describe("pageFromInput", () => {
  it("prefers a matching label, then a page number", () => {
    expect(pageFromInput("iv", book, book.length)).toBe(5);
    expect(pageFromInput("A-3", book, book.length)).toBe(11);
    expect(pageFromInput("2", book, book.length)).toBe(7);
    expect(pageFromInput("10", book, book.length)).toBe(10);
  });

  it("matches labels without caring about case or spaces", () => {
    expect(pageFromInput(" cover ", book, book.length)).toBe(1);
    expect(pageFromInput("a-2", book, book.length)).toBe(10);
  });

  it("clamps numbers and rejects anything else", () => {
    expect(pageFromInput("99", null, 12)).toBe(12);
    expect(pageFromInput("0", null, 12)).toBe(1);
    expect(pageFromInput("xiv", book, book.length)).toBeNull();
    expect(pageFromInput("", book, book.length)).toBeNull();
    expect(pageFromInput("3", null, 0)).toBeNull();
  });
});

describe("pageLabelOf and hasCustomLabels", () => {
  it("falls back to the page number", () => {
    expect(pageLabelOf(book, 2)).toBe("i");
    expect(pageLabelOf(null, 2)).toBe("2");
    expect(pageLabelOf(["", "x"], 1)).toBe("1");
  });

  it("only reports labels that differ from plain numbers", () => {
    expect(hasCustomLabels(book)).toBe(true);
    expect(hasCustomLabels(["1", "2", "3"])).toBe(false);
    expect(hasCustomLabels(null)).toBe(false);
  });
});

describe("formatNumber", () => {
  it("writes every PDF numbering style", () => {
    expect(formatNumber("D", 42)).toBe("42");
    expect(formatNumber("r", 1994)).toBe("mcmxciv");
    expect(formatNumber("R", 4)).toBe("IV");
    expect(formatNumber("a", 3)).toBe("c");
    expect(formatNumber("A", 28)).toBe("BB");
  });
});

describe("encodePageLabels", () => {
  it("finds the numbering runs", () => {
    expect(encodePageLabels(book)).toEqual([
      { start: 0, style: null, prefix: "Cover", first: 1 },
      { start: 1, style: "r", prefix: "", first: 1 },
      { start: 5, style: "D", prefix: "", first: 1 },
      { start: 8, style: "D", prefix: "A-", first: 1 },
    ]);
  });

  it("round-trips any list of labels", () => {
    const lists = [
      book,
      ["3", "4", "5", "9", "10"],
      ["x", "xi", "C", "D", "AA", "BB", "", "", "Appendix", "Appendix"],
      ["iii", "i", "ii", "Z", "AA"],
      ["0", "01", "02", "1.9", "1.10"],
    ];
    for (const labels of lists) {
      expect(labelsFromRanges(encodePageLabels(labels), labels.length)).toEqual(labels);
    }
  });

  it("starts a numbered run where the first number isn't 1", () => {
    expect(encodePageLabels(["7", "8"])).toEqual([{ start: 0, style: "D", prefix: "", first: 7 }]);
  });
});

async function labeledPdf(count: number, labels: string[] | null) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < count; index++) {
    doc.addPage([300 + index, 400]);
  }
  writePageLabels(doc, labels);
  return doc.save();
}

async function labelsOf(bytes: Uint8Array) {
  return readPageLabels(await PDFDocument.load(bytes));
}

async function widthsOf(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPages().map((page) => page.getWidth() - 300);
}

describe("page labels in the file", () => {
  it("reads a number tree with styles, prefixes, and start values", async () => {
    const doc = await PDFDocument.create();
    for (let index = 0; index < 5; index++) {
      doc.addPage();
    }
    const range = (entries: Record<string, unknown>) => doc.context.obj(entries as never);
    doc.catalog.set(
      PDFName.of("PageLabels"),
      doc.context.obj({
        Kids: [
          doc.context.register(range({ Nums: [PDFNumber.of(0), range({ S: PDFName.of("R") })] })),
          range({ Nums: [PDFNumber.of(2), range({ S: PDFName.of("D"), P: PDFHexString.fromText("§ "), St: PDFNumber.of(5) })] }),
        ],
      }),
    );
    expect(readPageLabels(doc)).toEqual(["I", "II", "§ 5", "§ 6", "§ 7"]);
  });

  it("returns null without a tree", async () => {
    expect(await labelsOf(await labeledPdf(2, null))).toBeNull();
  });

  it("moves labels with their pages", async () => {
    const bytes = await labeledPdf(5, ["i", "ii", "1", "2", "3"]);
    const moved = await applyPageEdit(bytes, { kind: "move", pages: [4], to: 0 });
    expect(await widthsOf(moved)).toEqual([4, 0, 1, 2, 3]);
    expect(await labelsOf(moved)).toEqual(["3", "i", "ii", "1", "2"]);
  });

  it("keeps the remaining labels when pages are deleted or extracted", async () => {
    const bytes = await labeledPdf(5, ["i", "ii", "1", "2", "3"]);
    expect(await labelsOf(await applyPageEdit(bytes, { kind: "delete", pages: [1, 2] }))).toEqual(["i", "2", "3"]);
    expect(await labelsOf(await extractPages(bytes, [3, 4]))).toEqual(["2", "3"]);
  });

  it("labels inserted pages from their own file, or by position", async () => {
    const target = await labeledPdf(3, ["i", "1", "2"]);
    const labeled = await labeledPdf(2, ["A-1", "A-2"]);
    const plain = await labeledPdf(2, null);
    expect(await labelsOf(await applyPageEdit(target, { kind: "insert", data: labeled, at: 1 }))).toEqual(["i", "A-1", "A-2", "1", "2"]);
    expect(await labelsOf(await applyPageEdit(target, { kind: "insert", data: plain, at: 3 }))).toEqual(["i", "1", "2", "4", "5"]);
  });

  it("doesn't add labels to a file that had none", async () => {
    const plain = await labeledPdf(3, null);
    const labeled = await labeledPdf(2, ["A-1", "A-2"]);
    expect(await labelsOf(await applyPageEdit(plain, { kind: "insert", data: labeled, at: 0 }))).toBeNull();
    expect(await labelsOf(await applyPageEdit(plain, { kind: "move", pages: [0], to: 3 }))).toBeNull();
  });

  it("leaves labels alone on rotation", async () => {
    const bytes = await labeledPdf(3, ["i", "ii", "1"]);
    expect(await labelsOf(await applyPageEdit(bytes, { kind: "rotate", pages: [0], by: 90 }))).toEqual(["i", "ii", "1"]);
  });

  it("combines files with each one's labels", async () => {
    const first = await labeledPdf(2, ["i", "ii"]);
    const second = await labeledPdf(2, ["B-1", "B-2"]);
    expect(await labelsOf(await combinePdfs([first, second]))).toEqual(["i", "ii", "B-1", "B-2"]);
  });
});
