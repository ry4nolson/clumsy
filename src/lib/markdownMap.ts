import { MAP_MAX_WIDTH, type MapLayout, type ViewerScroll } from "./documentMap";
import { lineAtOffset, offsetForLine, type LineBlock } from "./markdownScroll";

export function documentLayout(contentHeight: number, scale: number): MapLayout {
  const height = Math.max(0, contentHeight * scale);
  return { pages: [], width: MAP_MAX_WIDTH, height, viewerStops: [0, Math.max(contentHeight, 1)], mapStops: [0, height] };
}

export function sourceViewport(blocks: LineBlock[], lines: [number, number], scrollHeight: number): ViewerScroll {
  const top = offsetForLine(blocks, lines[0]);
  const bottom = offsetForLine(blocks, lines[1]);
  return { scrollTop: top, clientHeight: Math.max(1, bottom - top), scrollHeight };
}

export const sourceLineAt = (blocks: LineBlock[], scrollTop: number) => lineAtOffset(blocks, scrollTop);
