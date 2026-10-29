import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CompareView } from "../hooks/useComparison";
import { useMapMarks } from "../hooks/useMapMarks";
import { usePdfViewer, type FindQuery, type PdfViewerApi } from "../hooks/usePdfViewer";
import type { ViewState } from "../lib/documentWindows";
import { PasswordCancelledError, loadPdf } from "../lib/pdfjs";
import { emptySelection, followCurrentPage, selectPage, targetPages, type PageSelection } from "../lib/pageSelection";
import { readPdfFromPath, type PdfSource } from "../lib/platform";
import { ChangesList } from "./ChangesList";
import { CompareBar } from "./CompareBar";
import { DocumentMap } from "./DocumentMap";
import { FindBar } from "./FindBar";
import { Sidebar, type SidebarTab } from "./Sidebar";

export type TabSnapshot = {
  loaded: boolean;
  pageNumber: number;
  pagesCount: number;
  scale: number;
  scaleValue: string;
  tool: PdfViewerApi["tool"];
  modified: boolean;
  findOpen: boolean;
};

export type PageAction = { kind: "move"; pages: number[]; slot: number } | { kind: "menu"; page: number } | { kind: "delete" };

export type DocumentHandle = {
  viewer: PdfViewerApi;
  selectedPages: () => number[];
  openFind: (query?: string) => void;
  closeFind: () => void;
  findAgain: (previous: boolean) => void;
};

type DocumentTabProps = {
  id: string;
  paneId: string;
  column: number;
  source: PdfSource;
  initialView?: ViewState;
  initialSelection?: number[];
  active: boolean;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  onSidebarTab: (tab: SidebarTab) => void;
  documentMap: boolean;
  darkPages: boolean;
  keepImages: boolean;
  requestPassword: (fileName: string, incorrect: boolean) => Promise<string | null>;
  onSnapshot: (id: string, snapshot: TabSnapshot) => void;
  onLoaded: (id: string, source: PdfSource) => void;
  onFailed: (id: string, error: unknown, source: PdfSource) => void;
  onOpenUrl: (url: string) => void;
  onPageAction: (id: string, action: PageAction) => void;
  compare: CompareView | null;
};

export const DocumentTab = forwardRef<DocumentHandle, DocumentTabProps>(function DocumentTab(
  {
    id,
    paneId,
    column,
    source,
    initialView,
    initialSelection,
    active,
    sidebarOpen,
    sidebarTab,
    onSidebarTab,
    documentMap,
    darkPages,
    keepImages,
    requestPassword,
    onSnapshot,
    onLoaded,
    onFailed,
    onOpenUrl,
    onPageAction,
    compare,
  },
  ref,
) {
  const viewer = usePdfViewer();
  const [findOpen, setFindOpen] = useState(false);
  const [findFocusToken, setFindFocusToken] = useState(0);
  const [findSeed, setFindSeed] = useState<string | null>(null);
  const lastQuery = useRef<FindQuery | null>(null);
  const [selection, setSelection] = useState<PageSelection>(emptySelection);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const loaded = !!viewer.pdfDocument;

  const callbacks = useRef({ requestPassword, onLoaded, onFailed, initialView, initialSelection });
  callbacks.current = { requestPassword, onLoaded, onFailed, initialView, initialSelection };

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: Awaited<ReturnType<typeof loadPdf>> | null = null;
    const reread = !source.data.byteLength && source.path;
    const bytes = reread ? readPdfFromPath(reread).then((fresh) => fresh.data) : Promise.resolve(source.data);
    bytes
      .then((data) => loadPdf(data, (incorrect) => callbacks.current.requestPassword(source.name, incorrect)))
      .then((doc) => {
        loadedDocument = doc;
        if (cancelled) {
          doc.loadingTask.destroy();
          return;
        }
        const pages = callbacks.current.initialSelection ?? [];
        setSelection({ pages, anchor: pages[0] ?? null });
        viewer.setDocument(doc, callbacks.current.initialView);
        callbacks.current.onLoaded(id, source);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          callbacks.current.onFailed(id, error instanceof PasswordCancelledError ? null : error, source);
        }
      });
    return () => {
      cancelled = true;
      viewer.setDocument(null);
      loadedDocument?.loadingTask.destroy();
    };
  }, [id, source, viewer.setDocument]);

  useEffect(() => {
    onSnapshot(id, {
      loaded,
      pageNumber: viewer.pageNumber,
      pagesCount: viewer.pagesCount,
      scale: viewer.scale,
      scaleValue: viewer.scaleValue,
      tool: viewer.tool,
      modified: viewer.modified,
      findOpen,
    });
  }, [id, onSnapshot, loaded, viewer.pageNumber, viewer.pagesCount, viewer.scale, viewer.scaleValue, viewer.tool, viewer.modified, findOpen]);

  useEffect(() => {
    if (!active && viewer.tool !== "select") {
      viewer.setTool("select");
    }
  }, [active, viewer]);

  const currentPage = viewer.pageNumber - 1;
  const shownSelection = followCurrentPage(selection, currentPage);
  const mapMarks = useMapMarks(viewer, compare, documentMap);

  const choosePage = (page: number, modifiers: { toggle: boolean; range: boolean }) => {
    const next = selectPage(shownSelection, page, modifiers);
    const destination = next.pages.includes(page) ? page : next.pages.reduce((best, candidate) => (Math.abs(candidate - page) < Math.abs(best - page) ? candidate : best), next.pages[0] ?? page);
    setSelection(next);
    viewer.goToPage(destination + 1);
  };

  const closeFind = useCallback(() => {
    setFindOpen(false);
    viewer.closeFind();
  }, [viewer]);

  useImperativeHandle(
    ref,
    () => ({
      viewer,
      selectedPages: () => targetPages(followCurrentPage(selectionRef.current, viewer.pageNumber - 1), viewer.pageNumber - 1),
      openFind: (query) => {
        setFindSeed(query ?? null);
        setFindOpen(true);
        setFindFocusToken((token) => token + 1);
      },
      closeFind,
      findAgain: (previous) => {
        if (lastQuery.current) {
          viewer.find(lastQuery.current, "again", previous);
        }
      },
    }),
    [viewer, closeFind],
  );

  useEffect(() => {
    const container = viewer.containerRef.current;
    if (!container) {
      return;
    }
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      const href = link?.getAttribute("href");
      if (href && /^(https?|mailto):/i.test(href)) {
        event.preventDefault();
        event.stopPropagation();
        onOpenUrl(href);
      }
    };
    container.addEventListener("click", onClick, true);
    return () => container.removeEventListener("click", onClick, true);
  }, [viewer.containerRef, onOpenUrl]);

  return (
    <div className={`document-tab${active ? "" : " inactive"}`} inert={!active} data-pane-id={paneId} data-tab-id={id} style={{ gridColumn: column }}>
      {loaded && sidebarOpen && viewer.pdfDocument && (
        <Sidebar
          tab={sidebarTab}
          onTab={onSidebarTab}
          pdfDocument={viewer.pdfDocument}
          currentPage={viewer.pageNumber}
          selection={shownSelection.pages}
          onSelectPage={choosePage}
          onMovePages={(page, slot) =>
            onPageAction(id, { kind: "move", pages: shownSelection.pages.includes(page) ? shownSelection.pages : [page], slot })
          }
          onPageMenu={(page) => onPageAction(id, { kind: "menu", page })}
          onDeletePages={() => onPageAction(id, { kind: "delete" })}
          onNavigate={viewer.goToDestination}
          onOpenUrl={onOpenUrl}
          changes={compare && <ChangesList view={compare} />}
        />
      )}
      <main className={`viewer-area${darkPages ? " dark-pages" : ""}${keepImages ? " keep-images" : ""}${compare ? " comparing" : ""}`}>
        {compare && <CompareBar view={compare} />}
        {findOpen && loaded && (
          <FindBar
            status={viewer.findStatus}
            focusToken={findFocusToken}
            seed={findSeed}
            onFind={(query, type, previous) => {
              lastQuery.current = query;
              viewer.find(query, type, previous);
            }}
            onClose={closeFind}
          />
        )}
        <div ref={viewer.containerRef} className="viewer-container" tabIndex={-1}>
          <div className="pdfViewer" />
        </div>
        {!loaded && <div className="tab-loading">Opening {source.name}…</div>}
      </main>
      {loaded && documentMap && viewer.pdfDocument && (
        <DocumentMap
          pdfDocument={viewer.pdfDocument}
          containerRef={viewer.containerRef}
          rotation={viewer.pagesRotation}
          selection={shownSelection.pages}
          marks={mapMarks}
        />
      )}
    </div>
  );
});
