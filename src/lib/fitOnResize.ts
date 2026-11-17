import type { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";

const presetScales = new Set(["page-width", "page-fit", "auto"]);

export function refitOnResize(container: HTMLElement, viewer: PDFViewer, touch: boolean) {
  let lastSize = "";
  const observer = new ResizeObserver(([entry]) => {
    const box = entry.borderBoxSize?.[0];
    const width = Math.round(box?.inlineSize ?? container.offsetWidth);
    const height = Math.round(box?.blockSize ?? container.offsetHeight);
    const size = `${width}x${height}`;
    if (!width || !height || size === lastSize) {
      return;
    }
    const keyboardOnly = touch && lastSize.startsWith(`${width}x`);
    lastSize = size;
    if (keyboardOnly) {
      return;
    }
    const preset = viewer.currentScaleValue;
    if (viewer.pdfDocument && presetScales.has(preset)) {
      viewer.currentScaleValue = preset;
    }
  });
  observer.observe(container, { box: "border-box" });
  return () => observer.disconnect();
}
