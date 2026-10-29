import { otherSide, type Anchor, type Side } from "./comparison";
import { rotateRect } from "./diffRects";

export type ScrollLocation = { page: number; y: number };

function clampLocation({ page, y }: ScrollLocation, pages: number): ScrollLocation {
  while (y > 1 && page < pages - 1) {
    y -= 1;
    page += 1;
  }
  while (y < 0 && page > 0) {
    y += 1;
    page -= 1;
  }
  const clampedPage = Math.min(Math.max(page, 0), Math.max(pages - 1, 0));
  return { page: clampedPage, y: clampedPage === page ? Math.min(y, 1) : 0 };
}

export function syncLocation(anchors: Anchor[], from: Side, location: ScrollLocation, rotation: Record<Side, number>, targetPages: number): ScrollLocation {
  const to = otherSide(from);
  const onPage = anchors
    .filter((anchor) => anchor[from].page === location.page)
    .map((anchor) => ({ from: rotateRect(anchor[from], rotation[from]), to: rotateRect(anchor[to], rotation[to]) }))
    .sort((a, b) => a.from.y - b.from.y);
  const best = onPage.findLast((anchor) => anchor.from.y <= location.y) ?? onPage[0];
  if (best) {
    return clampLocation({ page: best.to.page, y: best.to.y + location.y - best.from.y }, targetPages);
  }
  const previous = anchors.findLast((anchor) => anchor[from].page < location.page);
  const page = previous ? previous[to].page + location.page - previous[from].page : location.page;
  return clampLocation({ page, y: location.y }, targetPages);
}
