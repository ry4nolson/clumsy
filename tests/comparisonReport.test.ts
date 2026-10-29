import { PDFArray, PDFDocument, PDFRawStream, PDFRef, decodePDFRawStream, type PDFPage } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";
import { buildComparison } from "../src/lib/comparison";
import { buildComparisonReport, changePages, pageRanges, toEncodable, wrapText } from "../src/lib/comparisonReport";
import type { Token } from "../src/lib/diffTokens";
import { diffWords } from "../src/lib/textDiff";

function tokens(lines: string[][]): Token[] {
  return lines.flatMap((words, line) =>
    words.map((text, index) => ({ text, rects: [{ page: Math.floor(line / 10), x: index * 0.12, y: (line % 10) * 0.1, width: 0.1, height: 0.02 }] })),
  );
}

function compare(left: string[][], right: string[][], pages = { left: 1, right: 1 }) {
  const a = tokens(left);
  const b = tokens(right);
  return buildComparison(a, b, diffWords(a.map((token) => token.text), b.map((token) => token.text))!, pages);
}

function pageText(document: PDFDocument, page: PDFPage) {
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const stream = ref instanceof PDFRef ? document.context.lookup(ref) : ref;
      const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : new Uint8Array();
      const source = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
      return Array.from(source.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g), ([, hex]) => hex.replace(/../g, (pair) => String.fromCharCode(parseInt(pair, 16)))).join("\n");
    })
    .join("\n");
}

async function readReport(bytes: Uint8Array) {
  const document = await PDFDocument.load(bytes);
  return { document, text: document.getPages().map((page) => pageText(document, page)).join("\n") };
}

const names = { left: "Draft.pdf", right: "Final.pdf" };
const date = new Date(2026, 9, 29, 15, 4);

describe("report helpers", () => {
  it("collapses page numbers into ranges", () => {
    expect(pageRanges([0, 1, 2, 4, 6, 7, 2])).toBe("1–3, 5, 7–8");
    expect(pageRanges([])).toBe("");
  });

  it("names the pages a change touches on each side", () => {
    const [change] = compare([["a"], ...Array.from({ length: 10 }, () => ["b"])], [["a"]], { left: 2, right: 1 }).changes;
    expect(changePages(change, "left")).toBe("pages 1–2");
    expect(changePages(change, "right")).toBe("page 1");
    expect(changePages({ ...change, right: [] }, "right")).toBeNull();
  });

  it("keeps full text beyond the sidebar snippet", () => {
    const long = Array.from({ length: 40 }, (_, index) => `word${index}`);
    const [change] = compare([["a"]], [["a", ...long]]).changes;
    expect(change.after.length).toBe(80);
    expect(change.afterText).toBe(long.join(" "));
  });

  it("replaces characters the report font can't draw", () => {
    const supported = new Set(Array.from("abcdeé ?", (char) => char.codePointAt(0)!));
    expect(toEncodable("é́a b 中 ć", supported)).toBe("éa b ? c");
  });

  it("wraps on spaces and breaks words that don't fit", () => {
    const measure = (text: string) => text.length;
    expect(wrapText("one two three four", 9, measure)).toEqual(["one two", "three", "four"]);
    expect(wrapText("a abcdefghijkl", 5, measure)).toEqual(["a abc", "defgh", "ijkl"]);
    expect(wrapText("  ", 5, measure)).toEqual([]);
  });
});

describe("buildComparisonReport", () => {
  it("writes names, totals, and each change's text", async () => {
    const comparison = compare(
      [["The", "quick", "fox"], ["jumps", "over", "the", "dog"], ["Old", "closing", "line"]],
      [["The", "slow", "fox"], ["jumps", "over", "the", "lazy", "dog"]],
    );
    const { document, text } = await readReport(await buildComparisonReport({ comparison, names, date }));
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe("Comparison of Draft.pdf and Final.pdf");
    for (const expected of ["Comparison Report", "Draft.pdf (1 page)", "Final.pdf (1 page)", "3 changes: 1 added, 1 removed, 1 changed", "2 words added, 4 words removed"]) {
      expect(text).toContain(expected);
    }
    expect(text).toContain("1. Changed");
    expect(text).toContain("quick");
    expect(text).toContain("slow");
    expect(text).toContain("lazy");
    expect(text).toContain("Old closing line");
    expect(text).toContain("Page 1 of 1");
  });

  it("says when the text is the same", async () => {
    const { document, text } = await readReport(await buildComparisonReport({ comparison: compare([["same"]], [["same"]]), names, date }));
    expect(document.getPageCount()).toBe(1);
    expect(text).toContain("The text of these documents is the same.");
    expect(text).not.toContain("Changes");
  });

  it("notes added pages and pages without text", async () => {
    const right = [["a"], ...Array.from({ length: 9 }, () => []), ["new", "page"]];
    const { text } = await readReport(await buildComparisonReport({ comparison: compare([["a"]], right, { left: 2, right: 2 }), names, date }));
    expect(text).toContain("Pages only in the changed document: 2");
    expect(text).toContain("Pages in the original document with no text to compare: 2");
  });

  it("flows long reports onto more pages and keeps all the text", async () => {
    const lines = Array.from({ length: 300 }, (_, line) => [`left${line}`, "shared", `word${line}`]);
    const changed = lines.map(([, shared, word], line) => [`right${line}`, shared, word]);
    const comparison = compare(lines, changed, { left: 30, right: 30 });
    const { document, text } = await readReport(await buildComparisonReport({ comparison, names, date }));
    expect(comparison.changes).toHaveLength(300);
    expect(document.getPageCount()).toBeGreaterThan(5);
    expect(text).toContain("300. Changed");
    expect(text).toContain("right299");
    expect(text).toContain(`Page ${document.getPageCount()} of ${document.getPageCount()}`);
  });
});
