import { useCallback, type RefObject } from "react";
import type { PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";

type ControlParts = { viewer: PDFViewer; linkService: PDFLinkService };

export function useViewerControls(partsRef: RefObject<ControlParts | null>) {
  const stepPage = useCallback((direction: 1 | -1) => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument) {
      if (direction > 0) {
        viewer.nextPage();
      } else {
        viewer.previousPage();
      }
    }
  }, [partsRef]);

  const goToDestination = useCallback((dest: unknown) => {
    partsRef.current?.linkService.goToDestination(dest as string);
  }, [partsRef]);

  const setZoom = useCallback((value: string | number) => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument) {
      viewer.currentScaleValue = String(value);
    }
  }, [partsRef]);

  const zoom = useCallback((direction: 1 | -1) => {
    const viewer = partsRef.current?.viewer;
    if (!viewer?.pdfDocument) {
      return;
    }
    if (direction > 0) {
      viewer.increaseScale();
    } else {
      viewer.decreaseScale();
    }
  }, [partsRef]);

  const rotate = useCallback((direction: 1 | -1 = 1) => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument) {
      viewer.pagesRotation = (viewer.pagesRotation + 90 * direction + 360) % 360;
    }
  }, [partsRef]);

  return { stepPage, goToDestination, setZoom, zoom, rotate };
}
