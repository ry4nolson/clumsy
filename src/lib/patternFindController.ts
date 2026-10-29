import { PDFFindController } from "pdfjs-dist/web/pdf_viewer.mjs";
import { findPatternMatches } from "./findPattern";

export class PatternFindController extends PDFFindController {
  pattern: RegExp | null = null;
  patternEntireWord = false;

  match(query: string | string[], pageContent: string, pageIndex: number) {
    return this.pattern ? findPatternMatches(this.pattern, pageContent, this.patternEntireWord) : super.match(query, pageContent, pageIndex);
  }
}
