import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CompareView } from "../hooks/useComparison";
import { useDocumentMenu } from "../hooks/useDocumentMenu";
import { useEditorUi } from "../hooks/useEditorUi";
import { useMapMarks } from "../hooks/useMapMarks";
import { usePdfViewer, type EditorParams, type FindQuery, type FindType, type PdfViewerApi, type ViewStart } from "../hooks/usePdfViewer";
import { useScrolling } from "../hooks/useScrolling";
import type { CommandId } from "../lib/commands";
import type { ViewState } from "../lib/documentWindows";
import type { SignaturePreview } from "../lib/editorManagers";
import { PasswordCancelledError, loadPdf, passwordOf } from "../lib/pdfjs";
import { passwordAnswers } from "../lib/passwordAnswers";
import { passwordRoleOffThread } from "../lib/pageEditWorker";
import { emptySelection, followCurrentPage, selectPage, targetPages, type PageSelection } from "../lib/pageSelection";
import { isExternalUrl } from "../lib/markdownLinks";
import { getRecentFiles, readPdfFromPath, type PdfSource } from "../lib/platform";
import type { Protection } from "../lib/protection";
import { runEnd, type LabelNumbering } from "../lib/pageLabels";
import { documentView, scrollsVertically, type DocumentSidebar, type ViewModes } from "../lib/viewModes";
import { ChangesList } from "./ChangesList";
import { CommentsList } from "./CommentsList";
import { CompareBar } from "./CompareBar";
import { DocumentMap } from "./DocumentMap";
import { EditorSheets, EditorUndoBar } from "./EditorSheets";
import { FindBar } from "./FindBar";
import { PageLabelsDialog, type PageLabelsRequest } from "./PageLabelsDialog";
import { PasswordSetDialog } from "./PasswordSetDialog";
import { Sidebar, type SidebarTab } from "./Sidebar";
import "./Forms.css";

const HIDDEN_RELEASE_MS = 30_000;

export type TabSnapshot = {
  loaded: boolean;
  pageNumber: number;
  pagesCount: number;
  scale: number;
  scaleValue: string;
  tool: PdfViewerApi["tool"];
  modified: boolean;
  findOpen: boolean;
  scrollMode: PdfViewerApi["scrollMode"];
  spreadMode: PdfViewerApi["spreadMode"];
  pageLabels: string[] | null;
  editorParams: EditorParams;
  selectedEditor: boolean;
  signatures: SignaturePreview[];
  sheetOpen: boolean;
  hasForm: boolean;
  mark: PdfViewerApi["mark"];
};

export type PageAction =
  | { kind: "move"; pages: number[]; slot: number }
  | { kind: "delete" }
  | { kind: "label"; from: number; to: number; numbering: LabelNumbering | null }
  | { kind: "protect"; password: string };

export type DocumentHandle = {
  viewer: PdfViewerApi;
  selectedPages: () => number[];
  explicitPages: () => number[];
  openFind: (query?: string) => void;
  closeFind: () => void;
  findAgain: (previous: boolean) => void;
  editPageLabels: (pages?: number[]) => void;
  editPassword: () => void;
};

export type DocumentTabProps = {
  id: string;
  paneId: string;
  column: number;
  source: PdfSource;
  protection?: Protection;
  initialView?: ViewState;
  initialSelection?: number[];
  active: boolean;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  onSidebarTab: (tab: SidebarTab) => void;
  documentMap: boolean;
  darkPages: boolean;
  keepImages: boolean;
  defaultModes: ViewModes;
  caretBrowsing: boolean;
  editorDefaults: EditorParams;
  onDocumentSidebar: (sidebar: DocumentSidebar) => void;
  requestPassword: (fileName: string, incorrect: boolean) => Promise<string | null>;
  onSnapshot: (id: string, snapshot: TabSnapshot) => void;
  onLoaded: (id: string, source: PdfSource, protection?: Protection) => void;
  onOwnerPassword: (id: string, source: PdfSource) => void;
  onFailed: (id: string, error: unknown, source: PdfSource) => void;
  onOpenUrl: (url: string) => void;
  onPageAction: (id: string, action: PageAction) => void;
  onMenuCommand: (id: CommandId, pages: number[]) => void;
  onUndoRemoval: (id: string) => void;
  compare: CompareView | null;
};

type StartWithSidebar = ViewStart & { sidebar?: DocumentSidebar };

async function viewStart(doc: PDFDocumentProxy, path: string | null, view: ViewState | undefined, modes: ViewModes): Promise<StartWithSidebar> {
  if (view) {
    return { view, modes };
  }
  const recent = path ? await getRecentFiles().catch(() => null) : null;
  if (recent?.some((entry) => entry.path === path)) {
    return { modes };
  }
  const [pageMode, pageLayout, openAction] = await Promise.all([
    doc.getPageMode().catch(() => null),
    doc.getPageLayout().catch(() => null),
    doc.getOpenAction().catch(() => null),
  ]);
  const { sidebar, ...documentModes } = documentView(pageMode, pageLayout);
  const dest: unknown = openAction?.get("dest");
  const destination = Array.isArray(dest) ? dest : null;
  return { modes: { ...modes, ...documentModes }, destination, sidebar };
}

export const DocumentTab = forwardRef<DocumentHandle, DocumentTabProps>(function DocumentTab(
  {
    id,
    paneId,
    column,
    source,
    protection,
    initialView,
    initialSelection,
    active,
    sidebarOpen,
    sidebarTab,
    onSidebarTab,
    documentMap,
    darkPages,
    keepImages,
    defaultModes,
    caretBrowsing,
    editorDefaults,
    onDocumentSidebar,
    requestPassword,
    onSnapshot,
    onLoaded,
    onOwnerPassword,
    onFailed,
    onOpenUrl,
    onPageAction,
    onMenuCommand,
    onUndoRemoval,
    compare,
  },
  ref,
) {
  const viewer = usePdfViewer();
  const scrolling = useScrolling(viewer.containerRef);
  const editorState = useEditorUi(viewer.editorUi);
  const sheetOpen = !!(editorState.altText || editorState.signature || editorState.description || editorState.comment);
  const [findOpen, setFindOpen] = useState(false);
  const [findFocusToken, setFindFocusToken] = useState(0);
  const [findSeed, setFindSeed] = useState<string | null>(null);
  const lastQuery = useRef<FindQuery | null>(null);
  const [selection, setSelection] = useState<PageSelection>(emptySelection);
  const [labelsRequest, setLabelsRequest] = useState<PageLabelsRequest | null>(null);
  const [passwordRequest, setPasswordRequest] = useState<{ changing: boolean } | null>(null);
  const lastProtection = useRef<Protection | undefined>(undefined);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const loaded = !!viewer.pdfDocument;

  const findRecorded = useRef(false);
  const callbacks = useRef({ requestPassword, onLoaded, onFailed, onOwnerPassword, onDocumentSidebar, initialView, initialSelection, defaultModes, protection });
  callbacks.current = { requestPassword, onLoaded, onFailed, onOwnerPassword, onDocumentSidebar, initialView, initialSelection, defaultModes, protection };
  if (protection) {
    lastProtection.current = protection;
  }

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: Awaited<ReturnType<typeof loadPdf>> | null = null;
    const reread = !source.data.byteLength && source.path;
    const bytes = reread ? readPdfFromPath(reread).then((fresh) => fresh.data) : Promise.resolve(source.data);
    const answers = passwordAnswers([callbacks.current.protection, lastProtection.current], (incorrect) => callbacks.current.requestPassword(source.name, incorrect));
    bytes
      .then((data) => loadPdf(data, answers.ask))
      .then(async (doc) => {
        loadedDocument = doc;
        if (cancelled) {
          doc.loadingTask.destroy();
          return;
        }
        const { sidebar, ...start } = await viewStart(doc, source.path, callbacks.current.initialView, callbacks.current.defaultModes);
        if (cancelled) {
          return;
        }
        const pages = callbacks.current.initialSelection ?? [];
        setSelection({ pages, anchor: pages[0] ?? null });
        viewer.setDocument(doc, start);
        if (sidebar) {
          callbacks.current.onDocumentSidebar(sidebar);
        }
        const { protection: used, typed } = answers.accepted(passwordOf(doc));
        if (used) {
          lastProtection.current = used;
        }
        callbacks.current.onLoaded(id, source, used);
        if (used && typed) {
          const role = await doc
            .getData()
            .then((data) => passwordRoleOffThread(data, used.password))
            .catch(() => null);
          if (role === "owner" && !cancelled) {
            lastProtection.current = { ...used, ownerPassword: true };
            callbacks.current.onOwnerPassword(id, source);
          }
        }
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
      scrollMode: viewer.scrollMode,
      spreadMode: viewer.spreadMode,
      pageLabels: viewer.pageLabels,
      editorParams: viewer.editorParams,
      selectedEditor: viewer.selectedEditor,
      signatures: editorState.signatures,
      sheetOpen,
      hasForm: viewer.hasForm,
      mark: viewer.mark,
    });
  }, [
    id,
    onSnapshot,
    loaded,
    viewer.pageNumber,
    viewer.pagesCount,
    viewer.scale,
    viewer.scaleValue,
    viewer.tool,
    viewer.modified,
    findOpen,
    viewer.scrollMode,
    viewer.spreadMode,
    viewer.pageLabels,
    viewer.editorParams,
    viewer.selectedEditor,
    editorState.signatures,
    sheetOpen,
    viewer.hasForm,
    viewer.mark,
  ]);

  useEffect(() => {
    if (!active && viewer.tool !== "select") {
      viewer.setTool("select");
    }
  }, [active, viewer]);

  const { setCaretBrowsing, setEditorDefaults, setImageRestore } = viewer;
  useEffect(() => setCaretBrowsing(caretBrowsing && active && loaded), [setCaretBrowsing, caretBrowsing, active, loaded]);
  useEffect(() => setImageRestore(darkPages && keepImages), [setImageRestore, darkPages, keepImages]);

  const { releasePages, renderPages } = viewer;
  useEffect(() => {
    if (active || !loaded) {
      return;
    }
    const timer = window.setTimeout(releasePages, HIDDEN_RELEASE_MS);
    return () => {
      window.clearTimeout(timer);
      renderPages();
    };
  }, [active, loaded, releasePages, renderPages]);
  useEffect(() => setEditorDefaults(editorDefaults), [setEditorDefaults, editorDefaults]);

  const currentPage = viewer.pageNumber - 1;
  const shownSelection = followCurrentPage(selection, currentPage);
  const mapShown = documentMap && scrollsVertically(viewer.scrollMode);
  const mapMarks = useMapMarks(viewer, compare, mapShown);

  const choosePage = (page: number, modifiers: { toggle: boolean; range: boolean }) => {
    const next = selectPage(shownSelection, page, modifiers);
    const destination = next.pages.includes(page) ? page : next.pages.reduce((best, candidate) => (Math.abs(candidate - page) < Math.abs(best - page) ? candidate : best), next.pages[0] ?? page);
    setSelection(next);
    viewer.goToPage(destination + 1);
  };

  const documentMenu = useDocumentMenu(viewer, () => followCurrentPage(selectionRef.current, viewer.pageNumber - 1).pages, onOpenUrl, onMenuCommand);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    findRecorded.current = false;
    viewer.closeFind();
  }, [viewer]);

  const runFind = useCallback(
    (query: FindQuery, type: FindType, previous = false) => {
      if (!query.query) {
        findRecorded.current = false;
      } else if (type === "again" || !findRecorded.current) {
        findRecorded.current = true;
        viewer.recordStop();
      }
      viewer.find(query, type, previous);
    },
    [viewer],
  );

  useImperativeHandle(
    ref,
    () => ({
      viewer,
      selectedPages: () => targetPages(followCurrentPage(selectionRef.current, viewer.pageNumber - 1), viewer.pageNumber - 1),
      explicitPages: () => followCurrentPage(selectionRef.current, viewer.pageNumber - 1).pages,
      openFind: (query) => {
        setFindSeed(query ?? null);
        setFindOpen(true);
        setFindFocusToken((token) => token + 1);
      },
      closeFind,
      findAgain: (previous) => {
        if (lastQuery.current) {
          runFind(lastQuery.current, "again", previous);
        }
      },
      editPageLabels: (explicit) => {
        const current = viewer.pageNumber - 1;
        const pages = explicit ?? targetPages(followCurrentPage(selectionRef.current, current), current);
        const range = pages.length > 1 ? [Math.min(...pages), Math.max(...pages)] : [current, runEnd(viewer.pageLabels, current, viewer.pagesCount)];
        setLabelsRequest({ pagesCount: viewer.pagesCount, labels: viewer.pageLabels, from: range[0], to: range[1] });
      },
      editPassword: () => setPasswordRequest({ changing: !!callbacks.current.protection }),
    }),
    [viewer, closeFind, runFind],
  );

  useEffect(() => {
    const container = viewer.containerRef.current;
    if (!container) {
      return;
    }
    const outsideHref = (event: MouseEvent) => {
      const href = (event.target as HTMLElement).closest("a[href]")?.getAttribute("href");
      return href && !href.startsWith("#") ? href : null;
    };
    const onClick = (event: MouseEvent) => {
      const href = outsideHref(event);
      if (href) {
        event.preventDefault();
        event.stopPropagation();
        if (event.type === "click" && isExternalUrl(href)) {
          onOpenUrl(href);
        }
      }
    };
    container.addEventListener("click", onClick, true);
    container.addEventListener("auxclick", onClick, true);
    return () => {
      container.removeEventListener("click", onClick, true);
      container.removeEventListener("auxclick", onClick, true);
    };
  }, [viewer.containerRef, onOpenUrl]);

  return (
    <div className={`document-tab${active ? "" : " inactive"}`} inert={!active} data-pane-id={paneId} data-tab-id={id} style={{ gridColumn: column }}>
      {loaded && sidebarOpen && viewer.pdfDocument && (
        <Sidebar
          tab={sidebarTab}
          onTab={onSidebarTab}
          pdfDocument={viewer.pdfDocument}
          paused={!active || scrolling}
          restoreImages={darkPages && keepImages}
          currentPage={viewer.pageNumber}
          pageLabels={viewer.pageLabels}
          selection={shownSelection.pages}
          onSelectPage={choosePage}
          onMovePages={(page, slot) =>
            onPageAction(id, { kind: "move", pages: shownSelection.pages.includes(page) ? shownSelection.pages : [page], slot })
          }
          onPageMenu={documentMenu.pageMenu}
          onDeletePages={() => onPageAction(id, { kind: "delete" })}
          onNavigate={viewer.goToDestination}
          onOpenUrl={onOpenUrl}
          changes={compare && <ChangesList view={compare} />}
          comments={
            editorState.comments && (
              <CommentsList comments={editorState.comments} selected={editorState.selectedComment} pageLabels={viewer.pageLabels} onSelect={(comment) => viewer.editorUi?.showComment(comment)} />
            )
          }
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
              runFind(query, type, previous);
            }}
            onClose={closeFind}
          />
        )}
        <div ref={viewer.containerRef} className="viewer-container" tabIndex={-1}>
          <div className="pdfViewer" />
        </div>
        {!loaded && <div className="tab-loading">Opening {source.name}…</div>}
        <EditorUndoBar editorUi={viewer.editorUi} removed={editorState.removed} onUndo={() => onUndoRemoval(id)} />
      </main>
      {loaded && mapShown && viewer.pdfDocument && (
        <DocumentMap
          pdfDocument={viewer.pdfDocument}
          containerRef={viewer.containerRef}
          paused={!active || scrolling}
          restoreImages={darkPages && keepImages}
          currentPage={viewer.pageNumber}
          rotation={viewer.pagesRotation}
          selection={shownSelection.pages}
          marks={mapMarks}
          fixedWidth={viewer.scrollMode === "wrapped"}
        />
      )}
      <EditorSheets editorUi={viewer.editorUi} state={editorState} />
      <PageLabelsDialog
        request={labelsRequest}
        onApply={(from, to, numbering) => {
          setLabelsRequest(null);
          onPageAction(id, { kind: "label", from, to, numbering });
        }}
        onClose={() => setLabelsRequest(null)}
      />
      <PasswordSetDialog
        request={passwordRequest}
        onSet={(password) => {
          setPasswordRequest(null);
          onPageAction(id, { kind: "protect", password });
        }}
        onClose={() => setPasswordRequest(null)}
      />
    </div>
  );
});
