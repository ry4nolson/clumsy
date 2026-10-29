import type { PDFDocumentProxy } from "pdfjs-dist";
import { tokenizePages, type PageText, type Token } from "./diffTokens";

export type DocumentText = { tokens: Token[]; pages: number };

const cache = new WeakMap<PDFDocumentProxy, Promise<DocumentText>>();

async function readText(pdfDocument: PDFDocumentProxy, onPage: (page: number) => void): Promise<DocumentText> {
  const pages: PageText[] = [];
  for (let number = 1; number <= pdfDocument.numPages; number++) {
    const page = await pdfDocument.getPage(number);
    const content = await page.getTextContent();
    const { transform, width, height } = page.getViewport({ scale: 1 });
    pages.push({ items: content.items.flatMap((item) => ("str" in item ? [item] : [])), viewport: { transform, width, height } });
    onPage(number);
  }
  return { tokens: tokenizePages(pages), pages: pdfDocument.numPages };
}

export function documentText(pdfDocument: PDFDocumentProxy, onPage: (page: number) => void = () => {}) {
  let text = cache.get(pdfDocument);
  if (!text) {
    text = readText(pdfDocument, onPage);
    cache.set(pdfDocument, text);
    text.catch(() => cache.delete(pdfDocument));
  }
  return text;
}
