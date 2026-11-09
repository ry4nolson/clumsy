import { newMarkup, quadsBox, type Markup, type MarkupStyle, type TextMarkupKind } from "./markup";
import { quadsFromRects, textMarkupWidth, textTurns, type Rect } from "./markupShapes";

type PageViewport = { width: number; height: number; convertToPdfPoint(x: number, y: number): number[] };
type ViewportOf = (pageIndex: number) => PageViewport | null;

const spanTurns = (node: Text) => textTurns(parseFloat(node.parentElement?.style.getPropertyValue("--rotate") ?? "") || 0);

function selectedTextNodes(range: Range, root: Element) {
  const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      range.intersectsNode(node) && node.textContent?.trim() && node.parentElement?.closest(".textLayer") && !node.parentElement.closest(".endOfContent") && root.contains(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const nodes: Text[] = [];
  if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
    const node = range.commonAncestorContainer as Text;
    return node.parentElement?.closest(".textLayer") && root.contains(node) ? [node] : [];
  }
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }
  return nodes;
}

export function selectedTextQuads(root: Element, viewportOf: ViewportOf) {
  const selection = document.getSelection();
  const rects = new Map<number, Map<number, Rect[]>>();
  for (let index = 0; selection && !selection.isCollapsed && index < selection.rangeCount; index++) {
    const range = selection.getRangeAt(index);
    for (const node of selectedTextNodes(range, root)) {
      const page = node.parentElement!.closest<HTMLElement>(".page");
      const pageIndex = Number(page?.dataset.pageNumber) - 1;
      const viewport = viewportOf(pageIndex);
      if (!page || !viewport) {
        continue;
      }
      const piece = document.createRange();
      piece.selectNodeContents(node);
      if (node === range.startContainer) {
        piece.setStart(node, range.startOffset);
      }
      if (node === range.endContainer) {
        piece.setEnd(node, range.endOffset);
      }
      const box = page.getBoundingClientRect();
      const scaleX = viewport.width / box.width;
      const scaleY = viewport.height / box.height;
      const turns = spanTurns(node);
      const pageRects = rects.get(pageIndex) ?? new Map<number, Rect[]>();
      rects.set(pageIndex, pageRects);
      for (const rect of piece.getClientRects()) {
        if (rect.width < 0.5 || rect.height < 0.5) {
          continue;
        }
        const [x1, y1] = viewport.convertToPdfPoint((rect.left - box.left) * scaleX, (rect.top - box.top) * scaleY);
        const [x2, y2] = viewport.convertToPdfPoint((rect.right - box.left) * scaleX, (rect.bottom - box.top) * scaleY);
        pageRects.set(turns, [...(pageRects.get(turns) ?? []), { left: Math.min(x1, x2), right: Math.max(x1, x2), bottom: Math.min(y1, y2), top: Math.max(y1, y2) }]);
      }
    }
  }
  const quads = new Map<number, number[]>();
  for (const [pageIndex, pageRects] of rects) {
    const merged = [...pageRects].flatMap(([turns, directed]) => quadsFromRects(directed, turns * 90));
    if (merged.length) {
      quads.set(pageIndex, merged);
    }
  }
  return quads;
}

export function textMarkupFromSelection(root: Element, viewportOf: ViewportOf, kind: TextMarkupKind, style: MarkupStyle, date: string): Markup[] {
  return [...selectedTextQuads(root, viewportOf)].map(([pageIndex, quads]) =>
    newMarkup({ id: `markup-${crypto.randomUUID()}`, pageIndex, kind, box: quadsBox(quads), quads, width: textMarkupWidth(quads) }, { ...style, fill: false }, date),
  );
}
