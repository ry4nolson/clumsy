import { describe, expect, it } from "vitest";
import { boxAround, confidentWords, coveredByText, downloadNote, hasText, modelUrl, ocrLanguage, ocrLanguages, ocrSummary, scanSamplePages, textCorners, type RecognizedWord } from "../src/lib/ocr";

const found = (text: string, confidence: number, lineEnd = false): RecognizedWord => ({ text, confidence, rect: { left: 1, top: 2, right: 3, bottom: 4 }, lineEnd });

describe("ocrLanguage", () => {
  it("falls back to English for anything it doesn't know", () => {
    expect(ocrLanguage("deu").label).toBe("German");
    expect(ocrLanguage("xx").code).toBe("eng");
    expect(ocrLanguage(null).code).toBe("eng");
  });

  it("lists English first, then the rest by name, with no repeats", () => {
    const labels = ocrLanguages.slice(1).map((language) => language.label);
    expect(ocrLanguages[0].code).toBe("eng");
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(new Set(ocrLanguages.map((language) => language.code)).size).toBe(ocrLanguages.length);
  });

  it("downloads from a pinned commit", () => {
    expect(modelUrl("eng")).toMatch(/^https:\/\/raw\.githubusercontent\.com\/tesseract-ocr\/tessdata_fast\/[0-9a-f]{40}\/eng\.traineddata$/);
  });

  it("says how big the download is", () => {
    expect(downloadNote(ocrLanguage("eng"))).toContain("about 4 MB");
    expect(downloadNote(ocrLanguage("vie"))).toContain("about 0.5 MB");
  });
});

describe("hasText", () => {
  it("needs more than a stray mark to count as text", () => {
    expect(hasText([])).toBe(false);
    expect(hasText(["  ", "12", " "])).toBe(false);
    expect(hasText(["Application form,", " page 1"])).toBe(true);
  });
});

describe("confidentWords", () => {
  it("drops blank and unlikely words", () => {
    expect(confidentWords([found("Total", 0.9), found("  ", 0.9), found("~;", 0.1), found("42", 0.8, true)]).map((word) => word.text)).toEqual(["Total", "42"]);
  });

  it("keeps the line break when the last word of a line is dropped", () => {
    const words = confidentWords([found("Total", 0.9), found("|", 0.05, true), found("Next", 0.9, true)]);
    expect(words.map((word) => word.lineEnd)).toEqual([true, true]);
  });

  it("carries each word's box", () => {
    expect(confidentWords([found("Total", 0.9, true)])).toEqual([{ text: "Total", left: 1, top: 2, right: 3, bottom: 4, lineEnd: true }]);
  });
});

describe("ocrSummary", () => {
  it("counts what it did", () => {
    expect(ocrSummary({ recognized: 3, skipped: 0, empty: 0 })).toBe("Added searchable text to 3 pages. Nothing is written until you save.");
    expect(ocrSummary({ recognized: 1, skipped: 2, empty: 1 })).toBe("Added searchable text to 1 page. 2 pages had nothing new to read. No text was found on 1 page. Nothing is written until you save.");
  });

  it("says when nothing changed", () => {
    expect(ocrSummary({ recognized: 0, skipped: 4, empty: 0 })).toBe("Every page already has its text, so nothing changed.");
    expect(ocrSummary({ recognized: 0, skipped: 1, empty: 2 })).toBe("No text was found. 1 page had nothing new to read.");
  });
});

describe("scanSamplePages", () => {
  it("looks at the first, middle, and last page", () => {
    expect(scanSamplePages(0)).toEqual([]);
    expect(scanSamplePages(1)).toEqual([0]);
    expect(scanSamplePages(2)).toEqual([0, 1]);
    expect(scanSamplePages(300)).toEqual([0, 149, 299]);
  });
});

describe("text that's already on the page", () => {
  it("finds the corners of a line of text from its matrix", () => {
    expect(textCorners([12, 0, 0, 12, 72, 700], 100, 12)).toEqual([[72, 700], [172, 700], [72, 712], [172, 712]]);
    expect(boxAround(textCorners([0, 12, -12, 0, 300, 100], 50, 10))).toEqual({ left: 290, top: 100, right: 300, bottom: 150 });
  });

  it("drops a recognized word that sits on existing text and keeps one that doesn't", () => {
    const taken = [{ left: 100, top: 100, right: 400, bottom: 130 }];
    expect(coveredByText({ left: 120, top: 102, right: 200, bottom: 132 }, taken)).toBe(true);
    expect(coveredByText({ left: 120, top: 300, right: 200, bottom: 330 }, taken)).toBe(false);
    expect(coveredByText({ left: 380, top: 100, right: 480, bottom: 130 }, taken)).toBe(false);
    expect(coveredByText({ left: 1, top: 1, right: 1, bottom: 9 }, [])).toBe(true);
  });
});
