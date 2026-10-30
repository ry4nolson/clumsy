import { useEffect, useRef } from "react";
import { isTypingTarget } from "../lib/commands";
import { scrollsVertically } from "../lib/viewModes";
import type { PdfViewerApi } from "./usePdfViewer";

const keepsSpace = "button, a[href], select, summary, [role=button], [role=radio], [role=tab], dialog[open], .annotationLayer, .freeTextEditor";

export function wantsSpace(target: EventTarget | null) {
  return isTypingTarget(target) || (target instanceof Element && !!target.closest(keepsSpace));
}

const mouseButtons: Record<number, "back" | "forward"> = { 3: "back", 4: "forward" };

export function useViewerInput(activeViewer: () => PdfViewerApi | undefined) {
  const viewerRef = useRef(activeViewer);
  viewerRef.current = activeViewer;

  useEffect(() => {
    let held: PdfViewerApi | null = null;

    const release = (tap: boolean, backward: boolean) => {
      const viewer = held;
      held = null;
      if (!viewer || viewer.holdHand(false) || !tap) {
        return;
      }
      const container = viewer.containerRef.current;
      const direction = backward ? -1 : 1;
      if (container && scrollsVertically(viewer.scrollMode)) {
        container.scrollBy({ top: direction * container.clientHeight * 0.9 });
      } else {
        viewer.stepPage(direction);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.metaKey || event.ctrlKey || event.altKey || wantsSpace(event.target)) {
        return;
      }
      const viewer = viewerRef.current();
      if (!viewer?.pdfDocument) {
        return;
      }
      event.preventDefault();
      if (!held && !event.repeat && viewer.holdHand(true)) {
        held = viewer;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && held) {
        event.preventDefault();
        release(true, event.shiftKey);
      }
    };

    const onBlur = () => release(false, false);

    const onMouseUp = (event: MouseEvent) => {
      const direction = mouseButtons[event.button];
      if (direction && viewerRef.current()?.navigate(direction)) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);
}
