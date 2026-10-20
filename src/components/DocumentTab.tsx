import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { usePdfViewer, type FindQuery, type PdfViewerApi } from "../hooks/usePdfViewer";
import { PasswordCancelledError, loadPdf } from "../lib/pdfjs";
import type { PdfSource } from "../lib/platform";
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

export type DocumentHandle = {
  viewer: PdfViewerApi;
  openFind: (query?: string) => void;
  closeFind: () => void;
  findAgain: (previous: boolean) => void;
};

type DocumentTabProps = {
  id: string;
  paneId: string;
  column: number;
  source: PdfSource;
  active: boolean;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  onSidebarTab: (tab: SidebarTab) => void;
  darkPages: boolean;
  keepImages: boolean;
  requestPassword: (fileName: string, incorrect: boolean) => Promise<string | null>;
  onSnapshot: (id: string, snapshot: TabSnapshot) => void;
  onLoaded: (id: string) => void;
  onFailed: (id: string, error: unknown) => void;
  onOpenUrl: (url: string) => void;
};

export const DocumentTab = forwardRef<DocumentHandle, DocumentTabProps>(function DocumentTab(
  { id, paneId, column, source, active, sidebarOpen, sidebarTab, onSidebarTab, darkPages, keepImages, requestPassword, onSnapshot, onLoaded, onFailed, onOpenUrl },
  ref,
) {
  const viewer = usePdfViewer();
  const [findOpen, setFindOpen] = useState(false);
  const [findFocusToken, setFindFocusToken] = useState(0);
  const [findSeed, setFindSeed] = useState<string | null>(null);
  const lastQuery = useRef<FindQuery | null>(null);
  const loaded = !!viewer.pdfDocument;

  const callbacks = useRef({ requestPassword, onLoaded, onFailed });
  callbacks.current = { requestPassword, onLoaded, onFailed };

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: Awaited<ReturnType<typeof loadPdf>> | null = null;
    loadPdf(source.data, (incorrect) => callbacks.current.requestPassword(source.name, incorrect))
      .then((doc) => {
        loadedDocument = doc;
        if (cancelled) {
          doc.loadingTask.destroy();
          return;
        }
        viewer.setDocument(doc);
        callbacks.current.onLoaded(id);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          callbacks.current.onFailed(id, error instanceof PasswordCancelledError ? null : error);
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

  const closeFind = useCallback(() => {
    setFindOpen(false);
    viewer.closeFind();
  }, [viewer]);

  useImperativeHandle(
    ref,
    () => ({
      viewer,
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
    <div className={`document-tab${active ? "" : " inactive"}`} inert={!active} data-pane-id={paneId} style={{ gridColumn: column }}>
      {loaded && sidebarOpen && viewer.pdfDocument && (
        <Sidebar
          tab={sidebarTab}
          onTab={onSidebarTab}
          pdfDocument={viewer.pdfDocument}
          currentPage={viewer.pageNumber}
          onSelectPage={viewer.goToPage}
          onNavigate={viewer.goToDestination}
          onOpenUrl={onOpenUrl}
        />
      )}
      <main className={`viewer-area${darkPages ? " dark-pages" : ""}${keepImages ? " keep-images" : ""}`}>
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
    </div>
  );
});
