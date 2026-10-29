import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from "@cantoo/pdf-lib";
import { describeWords, summarizeChanges } from "./changeSummary";
import { changeKindLabels, type Change, type Comparison, type Side } from "./comparison";

export type ReportInput = { comparison: Comparison; names: Record<Side, string>; date: Date };

type Style = { font: PDFFont; size: number; color?: RGB };

const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_SIZE[0] - MARGIN * 2;
const LEADING = 1.35;
const LABEL_WIDTH = 64;
const TEXT_COLOR = rgb(0.13, 0.13, 0.13);
const MUTED_COLOR = rgb(0.42, 0.42, 0.42);
const REMOVED_COLOR = rgb(0.72, 0.11, 0.11);
const ADDED_COLOR = rgb(0.05, 0.45, 0.2);
const sideLabels: Record<Side, string> = { left: "Original", right: "Changed" };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function pageRanges(pages: number[]) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let index = 0; index < sorted.length; index++) {
    const start = sorted[index];
    while (sorted[index + 1] === sorted[index] + 1) {
      index++;
    }
    ranges.push(start === sorted[index] ? `${start + 1}` : `${start + 1}–${sorted[index] + 1}`);
  }
  return ranges.join(", ");
}

export function changePages(change: Change, side: Side) {
  const pages = change[side].map((rect) => rect.page);
  if (!pages.length) {
    return null;
  }
  return `${new Set(pages).size === 1 ? "page" : "pages"} ${pageRanges(pages)}`;
}

export function toEncodable(text: string, supported: Set<number>) {
  return Array.from(text.normalize("NFKC"), (char) => {
    if (supported.has(char.codePointAt(0)!)) {
      return char;
    }
    if (/\p{M}/u.test(char)) {
      return "";
    }
    const base = char.normalize("NFKD").replace(/\p{M}/gu, "");
    return base && Array.from(base).every((part) => supported.has(part.codePointAt(0)!)) ? base : /\s/.test(char) ? " " : "?";
  }).join("");
}

export function wrapText(text: string, width: number, measure: (text: string) => number) {
  const lines: string[] = [];
  let line = "";
  const pushWord = (word: string) => {
    for (const char of word) {
      if (line && measure(line + char) > width) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= width) {
      line = candidate;
    } else if (measure(word) <= width) {
      lines.push(line);
      line = word;
    } else {
      if (line) {
        line += " ";
      }
      pushWord(word);
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

function writer(document: PDFDocument, supported: Set<number>) {
  let page = document.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;
  const room = (height: number) => {
    if (y - height < MARGIN) {
      page = document.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
  };
  const draw = (text: string, x: number, { font, size, color = TEXT_COLOR }: Style) => page.drawText(text, { x: MARGIN + x, y: y - size, size, font, color });
  const advance = (size: number) => {
    y -= size * LEADING;
  };
  const paragraph = (text: string, style: Style, indent = 0) => {
    for (const line of wrapText(toEncodable(text, supported), CONTENT_WIDTH - indent, (part) => style.font.widthOfTextAtSize(part, style.size))) {
      room(style.size * LEADING);
      draw(line, indent, style);
      advance(style.size);
    }
  };
  const labeled = (label: string, labelStyle: Style, text: string, style: Style) => {
    const lines = wrapText(toEncodable(text, supported), CONTENT_WIDTH - LABEL_WIDTH, (part) => style.font.widthOfTextAtSize(part, style.size));
    lines.forEach((line, index) => {
      room(style.size * LEADING * (index === 0 ? Math.min(lines.length, 2) : 1));
      if (index === 0) {
        draw(label, 0, labelStyle);
      }
      draw(line, LABEL_WIDTH, style);
      advance(style.size);
    });
  };
  const gap = (height: number) => {
    y -= height;
  };
  const rule = () => {
    room(12);
    gap(4);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_SIZE[0] - MARGIN, y }, thickness: 0.5, color: MUTED_COLOR });
    gap(12);
  };
  return { paragraph, labeled, gap, rule, keepTogether: room };
}

function summaryLines(comparison: Comparison) {
  const totals = summarizeChanges(comparison.changes);
  const lines: string[] = [];
  if (!comparison.changes.length) {
    lines.push("The text of these documents is the same.");
  } else {
    lines.push(
      `${plural(comparison.changes.length, "change")}: ${totals.added} added, ${totals.removed} removed, ${totals.modified} changed`,
      describeWords(totals),
    );
  }
  const notedPages = (side: Side, note: string) =>
    pageRanges(comparison.notes[side].flatMap((value, page) => (value === note ? [page] : [])));
  const onlyIn = { left: notedPages("left", "removed"), right: notedPages("right", "added") };
  (["left", "right"] as const).forEach((side) => {
    if (onlyIn[side]) {
      lines.push(`Pages only in the ${sideLabels[side].toLowerCase()} document: ${onlyIn[side]}`);
    }
    const noText = notedPages(side, "noText");
    if (noText) {
      lines.push(`Pages in the ${sideLabels[side].toLowerCase()} document with no text to compare: ${noText}`);
    }
  });
  return lines;
}

export async function buildComparisonReport({ comparison, names, date }: ReportInput) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  const body: Style = { font: regular, size: 10 };
  const heading: Style = { font: bold, size: 13 };
  const out = writer(document, supported);
  const title = `Comparison of ${names.left} and ${names.right}`;
  document.setTitle(toEncodable(title, supported));
  document.setCreator("Clumsy");
  document.setProducer("Clumsy");
  document.setCreationDate(date);

  out.paragraph("Comparison Report", { font: bold, size: 20 });
  out.gap(6);
  (["left", "right"] as const).forEach((side) =>
    out.labeled(sideLabels[side], { font: bold, size: 10 }, `${names[side]} (${plural(comparison.notes[side].length, "page")})`, body),
  );
  out.labeled("Created", { font: bold, size: 10 }, date.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }), body);
  out.rule();
  out.paragraph("Summary", heading);
  out.gap(2);
  summaryLines(comparison).forEach((line) => out.paragraph(line, body));

  if (comparison.changes.length) {
    out.rule();
    out.paragraph("Changes", heading);
    out.gap(2);
  }
  comparison.changes.forEach((change, index) => {
    const where = (["left", "right"] as const).map((side) => `${sideLabels[side]} ${changePages(change, side) ?? "–"}`).join(" · ");
    out.keepTogether(body.size * LEADING * 3 + 6);
    out.gap(6);
    out.paragraph(`${index + 1}. ${changeKindLabels[change.kind]}  ·  ${where}`, { font: bold, size: 10 });
    if (change.kind !== "added") {
      out.labeled("Removed", { font: bold, size: 10, color: REMOVED_COLOR }, change.beforeText, body);
    }
    if (change.kind !== "removed") {
      out.labeled("Added", { font: bold, size: 10, color: ADDED_COLOR }, change.afterText, body);
    }
  });

  const pages = document.getPages();
  pages.forEach((page, index) => {
    const footer = `Page ${index + 1} of ${pages.length}`;
    page.drawText(footer, { x: PAGE_SIZE[0] - MARGIN - regular.widthOfTextAtSize(footer, 8), y: MARGIN / 2, size: 8, font: regular, color: MUTED_COLOR });
  });
  return document.save();
}
