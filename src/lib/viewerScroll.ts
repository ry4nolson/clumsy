import { rotateRect, type PageRect } from "./diffRects";
import type { ScrollLocation } from "./scrollSync";

export type ScrollableViewer = {
  pagesCount: number;
  currentPageNumber: number;
  pagesRotation: number;
  getPageView(index: number): { div?: HTMLElement } | undefined;
};

function pageOffset(container: HTMLElement, div: HTMLElement) {
  const page = div.getBoundingClientRect();
  const box = container.getBoundingClientRect();
  return { top: page.top - box.top + container.scrollTop, left: page.left - box.left + container.scrollLeft };
}

export function scrollLocation(viewer: ScrollableViewer, container: HTMLElement, offset = 0): ScrollLocation | null {
  const at = container.scrollTop + offset;
  const top = (page: number) => {
    const div = viewer.getPageView(page)?.div;
    return div ? pageOffset(container, div).top : Infinity;
  };
  let low = 0;
  let high = viewer.pagesCount - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (top(middle) <= at + 1) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const div = viewer.getPageView(low)?.div;
  return div?.offsetHeight ? { page: low, y: Math.min((at - top(low)) / div.offsetHeight, 1) } : null;
}

export function scrollToLocation(viewer: ScrollableViewer, container: HTMLElement, { page, y }: ScrollLocation, offset = 0) {
  const div = viewer.getPageView(page)?.div;
  if (!div) {
    return null;
  }
  container.scrollTop = pageOffset(container, div).top + y * div.offsetHeight - offset;
  return container.scrollTop;
}

export function revealRect(viewer: ScrollableViewer, container: HTMLElement, rect: PageRect) {
  const div = viewer.getPageView(rect.page)?.div;
  if (!div) {
    return null;
  }
  const shown = rotateRect(rect, viewer.pagesRotation);
  const left = pageOffset(container, div).left + shown.x * div.offsetWidth;
  if (left < container.scrollLeft || left > container.scrollLeft + container.clientWidth - 24) {
    container.scrollLeft = left - container.clientWidth / 3;
  }
  return scrollToLocation(viewer, container, { page: rect.page, y: shown.y }, container.clientHeight / 3);
}
