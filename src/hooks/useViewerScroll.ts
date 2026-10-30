import { useCallback, type RefObject } from "react";
import { ScrollMode, type PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { PageOverlay } from "../lib/comparison";
import type { PageRect } from "../lib/diffRects";
import { markCurrentChange } from "../lib/diffLayer";
import type { ScrollLocation } from "../lib/scrollSync";
import { revealRect, scrollLocation, scrollToLocation, type ScrollableViewer } from "../lib/viewerScroll";

export type DiffState = { overlays: Map<number, PageOverlay> | null; current: number };

export function useViewerScroll(
  partsRef: RefObject<{ viewer: PDFViewer } | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  diffRef: RefObject<DiffState>,
  paintDiffRef: RefObject<() => void>,
) {
  const setDiffOverlays = useCallback(
    (overlays: Map<number, PageOverlay> | null) => {
      const previous = diffRef.current.overlays;
      diffRef.current.overlays = overlays;
      if (previous) {
        containerRef.current?.querySelectorAll(".diff-layer").forEach((layer) => layer.remove());
      }
      if (overlays) {
        paintDiffRef.current();
      }
    },
    [diffRef, containerRef, paintDiffRef],
  );

  const setCurrentChange = useCallback(
    (current: number) => {
      diffRef.current.current = current;
      if (containerRef.current) {
        markCurrentChange(containerRef.current, current);
      }
    },
    [diffRef, containerRef],
  );

  const scrollView = useCallback(
    <T,>(run: (viewer: ScrollableViewer, container: HTMLElement) => T): T | null => {
      const viewer = partsRef.current?.viewer;
      const container = containerRef.current;
      return viewer?.pdfDocument && viewer.pagesCount && container ? run(viewer as unknown as ScrollableViewer, container) : null;
    },
    [partsRef, containerRef],
  );

  const scrollPosition = useCallback(() => scrollView((viewer, container) => scrollLocation(viewer, container)), [scrollView]);
  const readingPosition = useCallback(() => scrollView((viewer, container) => scrollLocation(viewer, container, container.clientHeight / 3)), [scrollView]);
  const scrollTo = useCallback((location: ScrollLocation) => scrollView((viewer, container) => scrollToLocation(viewer, container, location)), [scrollView]);
  const reveal = useCallback(
    (rect: PageRect) =>
      scrollView((viewer, container) => {
        const pdfViewer = partsRef.current?.viewer;
        if (pdfViewer && (pdfViewer.scrollMode === ScrollMode.PAGE || pdfViewer.scrollMode === ScrollMode.HORIZONTAL)) {
          pdfViewer.currentPageNumber = rect.page + 1;
        }
        return revealRect(viewer, container, rect);
      }),
    [scrollView, partsRef],
  );
  const rotation = useCallback(() => partsRef.current?.viewer.pagesRotation ?? 0, [partsRef]);

  return { setDiffOverlays, setCurrentChange, scrollPosition, readingPosition, scrollTo, reveal, rotation };
}
