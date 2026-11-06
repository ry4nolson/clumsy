import { useCallback, useEffect, useRef } from "react";
import type { CommandId } from "../lib/commands";
import { readContextTools } from "../lib/contextTools";
import { documentMenu, pageSection, targetPages, type DocumentMenuId, type DocumentMenuSpec, type MenuContext } from "../lib/documentMenu";
import { isExternalUrl } from "../lib/markdownLinks";
import { stepNav, type NavDirection } from "../lib/navHistory";
import { canPrint, isDesktop, showDocumentMenu } from "../lib/platform";
import type { PdfViewerApi } from "./usePdfViewer";

const nativeMenuTargets = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .commentPopup';

type Point = { x: number; y: number };

function linkAt(target: Element) {
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  const href = anchor?.getAttribute("href") ?? "";
  if (!anchor || !href) {
    return null;
  }
  return href.startsWith("#") ? { kind: "internal" as const, href, anchor } : isExternalUrl(href) ? { kind: "external" as const, href, anchor } : null;
}

function selectionIn(container: HTMLElement) {
  const selection = document.getSelection();
  const layer = selection?.anchorNode?.parentElement?.closest(".textLayer") ?? null;
  return !!selection && !selection.isCollapsed && container.contains(layer) && selection.toString().trim() !== "";
}

function canStep(viewer: PdfViewerApi, direction: NavDirection) {
  const state = viewer.viewState();
  return !!state?.history && !!stepNav(state.history, direction, { page: state.page, left: state.left, top: state.top });
}

export function useDocumentMenu(
  viewer: PdfViewerApi,
  selectedPages: () => number[],
  onOpenUrl: (url: string) => void,
  onCommand: (id: CommandId, pages: number[]) => void,
) {
  const latest = useRef({ viewer, selectedPages, onOpenUrl, onCommand });
  latest.current = { viewer, selectedPages, onOpenUrl, onCommand };

  const show = useCallback((spec: DocumentMenuSpec, pages: number[], point: Point, local: Partial<Record<DocumentMenuId, () => void>> = {}) => {
    return showDocumentMenu(spec, point, (id) => {
      const action = local[id];
      if (action) {
        action();
      } else {
        latest.current.onCommand(id as CommandId, pages);
      }
    });
  }, []);

  const pageMenu = useCallback(
    (page: number, point: Point) => {
      const { viewer, selectedPages } = latest.current;
      const pages = targetPages(page, selectedPages());
      show({ palette: null, sections: [pageSection(pages, viewer.pagesCount, viewer.pageLabels, canPrint)] }, pages, point);
    },
    [show],
  );

  useEffect(() => {
    const container = viewer.containerRef.current;
    if (!container) {
      return;
    }
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as Element;
      const link = linkAt(target);
      if (!isDesktop) {
        if (target.closest("a[href]") && !link) {
          event.preventDefault();
        }
        return;
      }
      if (target.closest(nativeMenuTargets)) {
        return;
      }
      event.preventDefault();
      const { viewer, selectedPages, onOpenUrl } = latest.current;
      if (!viewer.pdfDocument) {
        return;
      }
      const pageDiv = target.closest<HTMLElement>(".page[data-page-number]");
      const point = { x: event.clientX, y: event.clientY };
      const context: MenuContext = {
        page: pageDiv ? Number(pageDiv.dataset.pageNumber) - 1 : null,
        pagesCount: viewer.pagesCount,
        selectedPages: selectedPages(),
        pageLabels: viewer.pageLabels,
        textSelected: selectionIn(container),
        link: link && { kind: link.kind, href: link.href },
        activeTool: viewer.tool,
        mark: viewer.mark,
        contextTools: readContextTools(),
        canGoBack: canStep(viewer, "back"),
        canGoForward: canStep(viewer, "forward"),
        canAddComment: !!viewer.editorUi?.canAddNote(),
        canPrint,
        scaleValue: viewer.scaleValue,
      };
      const { spec, pages } = documentMenu(context);
      show(spec, pages, point, {
        openLink: () => link && onOpenUrl(link.href),
        followLink: () => link?.anchor.click(),
        addCommentHere: () => pageDiv && viewer.editorUi?.addNoteAt(pageDiv, point.x, point.y),
      });
    };
    container.addEventListener("contextmenu", onContextMenu, true);
    return () => container.removeEventListener("contextmenu", onContextMenu, true);
  }, [viewer.containerRef, show]);

  return { pageMenu };
}
