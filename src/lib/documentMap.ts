export type PageBox = { top: number; width: number; height: number };
export type MapRect = { top: number; left: number; width: number; height: number };
export type MapArea = { width: number; height: number };
export type MapLayout = { pages: MapRect[]; width: number; height: number; viewerStops: number[]; mapStops: number[] };
export type ViewerScroll = { scrollTop: number; clientHeight: number; scrollHeight: number };

export const MAP_MAX_WIDTH = 96;
export const MAP_PADDING = 3;
export const MAP_GAP = 1;
export const MIN_PAGE_WIDTH = 18;

export function layoutMap(boxes: PageBox[], viewerHeight: number, area: MapArea, minWidth = MIN_PAGE_WIDTH): MapLayout {
  const widest = Math.max(0, ...boxes.map((box) => box.width));
  const fullWidth = Math.max(0, area.width - 2 * MAP_PADDING);
  if (!boxes.length || !widest || !fullWidth) {
    return { pages: [], width: 0, height: 0, viewerStops: [0, viewerHeight], mapStops: [0, 0] };
  }
  const heightPerWidth = boxes.reduce((sum, box) => sum + box.height / widest, 0);
  const fixed = (boxes.length - 1) * MAP_GAP + 2 * MAP_PADDING;
  const fitted = (area.height - fixed) / heightPerWidth;
  const pageWidth = Math.min(fullWidth, Math.max(Math.min(minWidth, fullWidth), fitted));
  const pages: MapRect[] = [];
  const viewerStops = [0];
  const mapStops = [0];
  let top = MAP_PADDING;
  for (const box of boxes) {
    const width = (box.width / widest) * pageWidth;
    const height = (box.height / widest) * pageWidth;
    pages.push({ top, left: MAP_PADDING + (pageWidth - width) / 2, width, height });
    viewerStops.push(box.top, box.top + box.height);
    mapStops.push(top, top + height);
    top += height + MAP_GAP;
  }
  const height = top - MAP_GAP + MAP_PADDING;
  viewerStops.push(Math.max(viewerHeight, viewerStops.at(-1)!));
  mapStops.push(height);
  return { pages, width: pageWidth + 2 * MAP_PADDING, height, viewerStops, mapStops };
}

function interpolate(from: number[], to: number[], value: number) {
  if (value <= from[0]) {
    return to[0];
  }
  let low = 0;
  let high = from.length - 1;
  if (value >= from[high]) {
    return to[high];
  }
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (from[middle] <= value) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const span = from[high] - from[low];
  return span ? to[low] + ((value - from[low]) / span) * (to[high] - to[low]) : to[low];
}

export const toMap = (layout: MapLayout, y: number) => interpolate(layout.viewerStops, layout.mapStops, y);

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function sliderFor(layout: MapLayout, areaHeight: number, view: ViewerScroll) {
  const top = toMap(layout, view.scrollTop);
  const height = toMap(layout, view.scrollTop + view.clientHeight) - top;
  const overflow = layout.height - areaHeight;
  const maxScroll = view.scrollHeight - view.clientHeight;
  if (overflow <= 0 || maxScroll <= 0) {
    return { offset: 0, top, height };
  }
  const shown = clamp(view.scrollTop / maxScroll, 0, 1) * Math.max(0, areaHeight - height);
  const offset = clamp(top - shown, 0, overflow);
  return { offset, top: top - offset, height };
}

export function scrollForSlider(layout: MapLayout, areaHeight: number, view: ViewerScroll, sliderTop: number) {
  let low = 0;
  let high = Math.max(0, view.scrollHeight - view.clientHeight);
  for (let step = 0; step < 40 && high - low > 0.5; step++) {
    const middle = (low + high) / 2;
    if (sliderFor(layout, areaHeight, { ...view, scrollTop: middle }).top < sliderTop) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return Math.round((low + high) / 2);
}

export function visibleRange(layout: MapLayout, offset: number, areaHeight: number, margin = areaHeight / 2) {
  const start = offset - margin;
  const end = offset + areaHeight + margin;
  const first = layout.pages.findIndex((page) => page.top + page.height >= start);
  if (first < 0 || layout.pages[first].top > end) {
    return { first: 0, last: -1 };
  }
  let last = first;
  while (last + 1 < layout.pages.length && layout.pages[last + 1].top <= end) {
    last++;
  }
  return { first, last };
}
