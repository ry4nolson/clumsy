import type { PageNote, PageOverlay } from "./comparison";
import { rotateRect } from "./diffRects";

const noteLabels: Record<NonNullable<PageNote>, string> = {
  added: "Page added",
  removed: "Page removed",
  noText: "No text to compare on this page",
};

const painted = new WeakMap<HTMLElement, { overlay: PageOverlay; rotation: number }>();

const percent = (value: number) => `${(value * 100).toFixed(3)}%`;

export function renderDiffLayer(pageDiv: HTMLElement, overlay: PageOverlay | undefined, rotation: number, current: number) {
  let layer = pageDiv.querySelector<HTMLElement>(":scope > .diff-layer");
  if (!overlay) {
    layer?.remove();
    return;
  }
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "diff-layer";
    layer.setAttribute("aria-hidden", "true");
  }
  if (!layer.isConnected) {
    pageDiv.append(layer);
  }
  const previous = painted.get(layer);
  if (previous?.overlay === overlay && previous.rotation === rotation) {
    markCurrentChange(layer, current);
    return;
  }
  painted.set(layer, { overlay, rotation });
  const children: HTMLElement[] = overlay.rects.map((rect) => {
    const { x, y, width, height } = rotateRect(rect, rotation);
    const mark = document.createElement("div");
    mark.className = `diff-mark ${rect.kind}${rect.marker ? " marker" : ""}${rect.change === current ? " current" : ""}`;
    mark.dataset.change = String(rect.change);
    Object.assign(mark.style, { left: percent(x), top: percent(y), width: percent(width), height: percent(height) });
    return mark;
  });
  if (overlay.note) {
    const note = document.createElement("div");
    note.className = `diff-note ${overlay.note}`;
    note.textContent = noteLabels[overlay.note];
    children.push(note);
  }
  layer.replaceChildren(...children);
}

export function markCurrentChange(root: HTMLElement, current: number) {
  root.querySelectorAll(".diff-mark.current").forEach((mark) => mark.classList.remove("current"));
  root.querySelectorAll(`.diff-mark[data-change="${current}"]`).forEach((mark) => mark.classList.add("current"));
}

export type DiffViewer = {
  pagesCount: number;
  currentPageNumber: number;
  pagesRotation: number;
  getPageView(index: number): { div?: HTMLElement; renderingState?: number } | undefined;
};

export function paintDiffPage(viewer: DiffViewer, index: number, overlays: Map<number, PageOverlay> | null, current: number) {
  const div = viewer.getPageView(index)?.div;
  if (div) {
    renderDiffLayer(div, overlays?.get(index), viewer.pagesRotation, current);
  }
}

export function paintDiffPages(viewer: DiffViewer, overlays: Map<number, PageOverlay> | null, current: number) {
  const shown = viewer.currentPageNumber - 1;
  for (let index = 0; overlays && index < viewer.pagesCount; index++) {
    if (Math.abs(index - shown) <= 3 || viewer.getPageView(index)?.renderingState) {
      paintDiffPage(viewer, index, overlays, current);
    }
  }
}
