import { useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { scanSamplePages } from "../lib/ocr";
import { pageHasText } from "../lib/ocrPages";
import { isMobile } from "../lib/platform";
import { attachScanHints } from "../lib/scanHints";

export function useScanHint(doc: PDFDocumentProxy | null, active: boolean, containerRef: RefObject<HTMLElement | null>, quiet: boolean, onRecognize: (pages: number[]) => void) {
  const [textless, setTextless] = useState<PDFDocumentProxy | null>(null);
  const [checked, setChecked] = useState<PDFDocumentProxy | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const recognize = useRef(onRecognize);
  recognize.current = onRecognize;

  useEffect(() => {
    if (!doc || !active || isMobile || dismissed || checked === doc) {
      return;
    }
    let cancelled = false;
    (async () => {
      for (const page of scanSamplePages(doc.numPages)) {
        if (await pageHasText(doc, page)) {
          return false;
        }
      }
      return doc.numPages > 0;
    })()
      .catch(() => false)
      .then((none) => {
        if (!cancelled) {
          setChecked(doc);
          setTextless(none ? doc : null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [doc, active, dismissed, checked]);

  const bar = !!doc && textless === doc && !dismissed && !quiet;
  const onPages = !!doc && checked === doc && textless !== doc && !dismissed && !quiet;

  useEffect(() => {
    const container = containerRef.current;
    if (!doc || !container || !onPages) {
      return;
    }
    return attachScanHints(container, doc, { onRecognize: (page) => recognize.current([page]), onDismiss: () => setDismissed(true) });
  }, [doc, onPages, containerRef]);

  return { bar, recognize: () => recognize.current([]), dismiss: () => setDismissed(true) };
}
