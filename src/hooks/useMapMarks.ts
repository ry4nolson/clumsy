import { useEffect, useMemo, useState } from "react";
import { overlaysFor, type ChangeKind } from "../lib/comparison";
import type { PageRect, Rect } from "../lib/diffRects";
import { rangeRects } from "../lib/diffTokens";
import { findPageText } from "../lib/pdfText";
import type { CompareView } from "./useComparison";
import type { PdfViewerApi } from "./usePdfViewer";

export type MapMark = Rect & { kind: ChangeKind | "find"; current: boolean };
export type MapMarks = Map<number, MapMark[]>;

const FIND_DELAY = 150;

const matchRects = new WeakMap<number[], PageRect[][]>();

function addMark(marks: MapMarks, page: number, mark: MapMark) {
  const list = marks.get(page);
  if (list) {
    list.push(mark);
  } else {
    marks.set(page, [mark]);
  }
}

export function useMapMarks(viewer: PdfViewerApi, compare: CompareView | null, enabled: boolean) {
  const { pdfDocument, findStatus, findMatches } = viewer;
  const [findMarks, setFindMarks] = useState<MapMarks | null>(null);
  const searching = enabled && findStatus.total > 0;

  useEffect(() => {
    if (!searching || !pdfDocument) {
      setFindMarks(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const matches = findMatches();
      if (!matches) {
        setFindMarks(null);
        return;
      }
      const marks: MapMarks = new Map();
      for (const [page, positions] of matches.positions.entries()) {
        if (!positions?.length) {
          continue;
        }
        let rects = matchRects.get(positions);
        if (!rects) {
          const text = await findPageText(pdfDocument, page).catch(() => null);
          if (cancelled) {
            return;
          }
          if (!text) {
            continue;
          }
          const lengths = matches.lengths[page] ?? [];
          rects = rangeRects(text, page, positions.map((start, index) => [start, lengths[index] ?? 1]));
          matchRects.set(positions, rects);
        }
        rects.forEach((match, index) => {
          const current = matches.selected.pageIdx === page && matches.selected.matchIdx === index;
          match.forEach((rect) => addMark(marks, page, { ...rect, kind: "find", current }));
        });
      }
      if (!cancelled) {
        setFindMarks(marks);
      }
    }, FIND_DELAY);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searching, pdfDocument, findMatches, findStatus]);

  const comparison = enabled ? compare?.comparison : null;
  const side = compare?.side;
  const currentChange = compare?.current ?? -1;
  const changeMarks = useMemo(() => {
    if (!comparison || !side) {
      return null;
    }
    const marks: MapMarks = new Map();
    for (const [page, overlay] of overlaysFor(comparison, side)) {
      for (const rect of overlay.rects) {
        addMark(marks, page, { ...rect, kind: rect.kind, current: rect.change === currentChange });
      }
    }
    return marks;
  }, [comparison, side, currentChange]);

  return useMemo(() => {
    const marks: MapMarks = new Map();
    for (const source of [changeMarks, findMarks]) {
      source?.forEach((list, page) => list.forEach((mark) => addMark(marks, page, mark)));
    }
    return marks;
  }, [changeMarks, findMarks]);
}
