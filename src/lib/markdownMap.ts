import type { ChangeKind } from "./comparison";
import { MAP_MAX_WIDTH, MIN_PAGE_WIDTH, type MapLayout, type ViewerScroll } from "./documentMap";
import { lineAtOffset, offsetForLine, offsetsForLines, type LineBlock } from "./markdownScroll";

const ARTICLE_WIDTH = 860;

export const mapWidth = (articleWidth: number) => Math.min(MAP_MAX_WIDTH, Math.max(MIN_PAGE_WIDTH, Math.round((articleWidth * MAP_MAX_WIDTH) / ARTICLE_WIDTH)));

export const mapScale = (articleWidth: number) => mapWidth(articleWidth) / Math.max(articleWidth, 1);

export function documentLayout(contentHeight: number, scale: number): MapLayout {
  const height = Math.max(0, contentHeight * scale);
  return { pages: [], width: MAP_MAX_WIDTH, height, viewerStops: [0, Math.max(contentHeight, 1)], mapStops: [0, height] };
}

export function sourceViewport(blocks: LineBlock[], lines: [number, number], scrollHeight: number): ViewerScroll {
  const top = offsetForLine(blocks, lines[0]);
  const bottom = offsetForLine(blocks, lines[1]);
  return { scrollTop: top, clientHeight: Math.max(1, bottom - top), scrollHeight };
}

export type LineChange = { start: number; end: number; kind: ChangeKind; current: boolean };

export type MapChange = { y: number; height: number; kind: ChangeKind; current: boolean };

export function changeBands(blocks: LineBlock[], changes: readonly LineChange[]): MapChange[] {
  const offsets = offsetsForLines(blocks, changes.flatMap(({ start, end }) => [start, end]));
  return changes.map(({ start, end, kind, current }) => {
    const y = offsets.get(start) ?? 0;
    return { y, height: end > start ? Math.max(0, (offsets.get(end) ?? y) - y) : 0, kind, current };
  });
}

export const sourceLineAt = (blocks: LineBlock[], scrollTop: number) => lineAtOffset(blocks, scrollTop);
