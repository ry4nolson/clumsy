import { useCallback, type RefObject } from "react";
import { AnnotationEditorType } from "pdfjs-dist";
import { RenderingStates, type PDFLinkService, type PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import { restoreImages, type RenderedPageView } from "../lib/imageRestore";

type ControlParts = { viewer: PDFViewer; linkService: PDFLinkService };

export function useViewerControls(partsRef: RefObject<ControlParts | null>, restoreRef: RefObject<boolean>) {
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

  const releasePages = useCallback(() => {
    const viewer = partsRef.current?.viewer;
    if (!viewer?.pdfDocument || (viewer.annotationEditorMode as unknown as number) > AnnotationEditorType.NONE) {
      return;
    }
    for (let index = 0; index < viewer.pagesCount; index++) {
      const view = viewer.getPageView(index);
      if (view?.renderingState === RenderingStates.FINISHED) {
        view.destroy();
      }
    }
  }, [partsRef]);

  const renderPages = useCallback(() => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument) {
      viewer.update();
    }
  }, [partsRef]);

  const setImageRestore = useCallback((enabled: boolean) => {
    restoreRef.current = enabled;
    const viewer = partsRef.current?.viewer;
    for (let index = 0; viewer && index < viewer.pagesCount; index++) {
      const view = viewer.getPageView(index) as unknown as RenderedPageView | undefined;
      if (view?.canvas) {
        restoreImages(view, enabled);
      }
    }
  }, [partsRef, restoreRef]);

  return { stepPage, goToDestination, setZoom, zoom, rotate, releasePages, renderPages, setImageRestore };
}
