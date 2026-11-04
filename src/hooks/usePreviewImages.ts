import { useCallback, useEffect, useRef } from "react";
import { restorePreviewImages, type ShownPreview } from "../lib/imageRestore";

export function usePreviewImages(enabled: boolean) {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const shown = useRef<ShownPreview | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const draw = useCallback(() => {
    if (overlayRef.current) {
      restorePreviewImages(overlayRef.current, shown.current, enabledRef.current);
    }
  }, []);

  useEffect(draw, [enabled, draw]);

  const show = useCallback(
    (preview: ShownPreview | null) => {
      shown.current = preview;
      draw();
    },
    [draw],
  );

  return { overlayRef, show };
}
