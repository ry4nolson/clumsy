import { useCallback, useEffect, useRef, useState } from "react";
import { AnnotationEditorParamsType } from "pdfjs-dist";
import { FindBar } from "./components/FindBar";
import { PasswordDialog } from "./components/PasswordDialog";
import { Sidebar } from "./components/Sidebar";
import { SignatureDialog } from "./components/SignatureDialog";
import { Toolbar, inkColors } from "./components/Toolbar";
import { highlightColors, usePdfViewer, type EditorTool, type FindQuery } from "./hooks/usePdfViewer";
import { PasswordCancelledError, loadPdf } from "./lib/pdfjs";
import {
  confirmDiscard,
  downloadPdf,
  fileNameFromPath,
  isDesktop,
  onCloseRequested,
  onFileDrop,
  onOpenedFiles,
  openExternal,
  pickPdf,
  pickSavePath,
  readPdfFromPath,
  setWindowTitle,
  showError,
  writePdf,
  type PdfSource,
} from "./lib/platform";
import { usePersistentState, useSystemDarkMode } from "./lib/preferences";
import { isTypingTarget, resolveShortcut } from "./lib/shortcuts";

type OpenDocument = { name: string; path: string | null };
type PasswordRequest = { fileName: string; incorrect: boolean };

const colorParams: Partial<Record<EditorTool, number>> = {
  highlight: AnnotationEditorParamsType.HIGHLIGHT_COLOR,
  text: AnnotationEditorParamsType.FREETEXT_COLOR,
  draw: AnnotationEditorParamsType.INK_COLOR,
};

const isMac = navigator.userAgent.includes("Mac");

export default function App() {
  const viewer = usePdfViewer();
  const [openDocument, setOpenDocument] = useState<OpenDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = usePersistentState("clumsy.sidebar", true);
  const [darkPagesPreference, setDarkPagesPreference] = usePersistentState<"auto" | "on" | "off">("clumsy.darkPages", "auto");
  const [findOpen, setFindOpen] = useState(false);
  const [findFocusToken, setFindFocusToken] = useState(0);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [passwordRequest, setPasswordRequest] = useState<PasswordRequest | null>(null);
  const [toolColors, setToolColors] = useState<Record<string, string>>({
    highlight: Object.values(highlightColors)[0],
    text: inkColors[0],
    draw: inkColors[0],
  });
  const systemDark = useSystemDarkMode();
  const darkPages = darkPagesPreference === "on" || (darkPagesPreference === "auto" && systemDark);

  const passwordResolver = useRef<((password: string | null) => void) | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const lastQuery = useRef<FindQuery | null>(null);
  const loadToken = useRef(0);
  const stateRef = useRef({ openDocument, modified: viewer.modified });
  stateRef.current = { openDocument, modified: viewer.modified };

  const { pdfDocument, setDocument } = viewer;

  const openSource = useCallback(
    async (source: PdfSource | Promise<PdfSource | null>) => {
      const { openDocument: current, modified } = stateRef.current;
      if (current && modified && !(await confirmDiscard(current.name))) {
        return;
      }
      const token = ++loadToken.current;
      setLoading(true);
      try {
        const resolved = await source;
        if (!resolved) {
          return;
        }
        const doc = await loadPdf(resolved.data, (incorrect) => {
          setPasswordRequest({ fileName: resolved.name, incorrect });
          return new Promise((resolve) => {
            passwordResolver.current = resolve;
          });
        });
        if (token !== loadToken.current) {
          await doc.loadingTask.destroy();
          return;
        }
        const previous = viewer.pdfDocument;
        setDocument(doc);
        await previous?.loadingTask.destroy();
        setOpenDocument({ name: resolved.name, path: resolved.path });
        setFindOpen(false);
      } catch (error) {
        if (!(error instanceof PasswordCancelledError)) {
          await showError(`Could not open this PDF.\n\n${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        if (token === loadToken.current) {
          setLoading(false);
        }
      }
    },
    [setDocument, viewer.pdfDocument],
  );

  const openSourceRef = useRef(openSource);
  openSourceRef.current = openSource;

  const save = useCallback(
    async (saveAs: boolean) => {
      const current = stateRef.current.openDocument;
      if (!current) {
        return;
      }
      (document.activeElement as HTMLElement | null)?.blur();
      try {
        const bytes = await viewer.save();
        if (!bytes) {
          return;
        }
        if (!isDesktop) {
          downloadPdf(current.name, bytes);
          viewer.markSaved();
          return;
        }
        const path = saveAs || !current.path ? await pickSavePath(current.name) : current.path;
        if (!path) {
          return;
        }
        await writePdf(path, bytes);
        viewer.markSaved();
        setOpenDocument({ name: fileNameFromPath(path), path });
      } catch (error) {
        await showError(`Could not save.\n\n${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [viewer],
  );

  const toggleFind = useCallback(() => {
    if (!stateRef.current.openDocument) {
      return;
    }
    setFindOpen(true);
    setFindFocusToken((token) => token + 1);
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    viewer.closeFind();
  }, [viewer]);

  const find = useCallback(
    (query: FindQuery, type: "" | "again" | "casesensitivitychange" | "entirewordchange", findPrevious = false) => {
      lastQuery.current = query;
      viewer.find(query, type, findPrevious);
    },
    [viewer],
  );

  const changeTool = useCallback((tool: EditorTool) => viewer.setTool(tool), [viewer]);

  const changeToolColor = (color: string) => {
    const param = colorParams[viewer.tool];
    if (param === undefined) {
      return;
    }
    setToolColors((colors) => ({ ...colors, [viewer.tool]: color }));
    viewer.setEditorParam(param, color);
  };

  useEffect(() => {
    const title = openDocument ? `${openDocument.name}${viewer.modified ? " — Edited" : ""}` : "Clumsy";
    setWindowTitle(title);
  }, [openDocument, viewer.modified]);

  useEffect(() => {
    const cleanups: Array<Promise<() => void>> = [
      onOpenedFiles((paths) => openSourceRef.current(readPdfFromPath(paths[0]))),
      onFileDrop((source) => openSourceRef.current(source), setDragging),
      onCloseRequested(
        () => stateRef.current.modified,
        () => stateRef.current.openDocument?.name ?? "Document",
      ),
    ];
    return () => {
      cleanups.forEach((cleanup) => cleanup.then((dispose) => dispose()));
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      const action = resolveShortcut(event, isMac, typing);
      if (!action) {
        return;
      }
      const hasDocument = !!stateRef.current.openDocument;
      if (action === "escape") {
        if (findOpen) {
          closeFind();
        } else if (!typing && hasDocument && viewer.tool !== "select") {
          changeTool("select");
        }
        return;
      }
      if (action !== "open" && !hasDocument) {
        return;
      }
      event.preventDefault();
      const actions: Record<Exclude<typeof action, "escape">, () => void> = {
        open: () => openSource(pickPdf()),
        save: () => save(false),
        saveAs: () => save(true),
        find: toggleFind,
        findNext: () => lastQuery.current && viewer.find(lastQuery.current, "again", false),
        findPrevious: () => lastQuery.current && viewer.find(lastQuery.current, "again", true),
        zoomIn: () => viewer.zoom(1),
        zoomOut: () => viewer.zoom(-1),
        actualSize: () => viewer.setZoom(1),
        fitWidth: () => viewer.setZoom("page-width"),
        rotate: viewer.rotate,
        toggleSidebar: () => setSidebarOpen((open) => !open),
        firstPage: () => viewer.goToPage(1),
        lastPage: () => viewer.goToPage(viewer.pagesCount),
        nextPage: () => viewer.goToPage(viewer.pageNumber + 1),
        previousPage: () => viewer.goToPage(viewer.pageNumber - 1),
        toolSelect: () => changeTool("select"),
        toolHighlight: () => changeTool("highlight"),
        toolText: () => changeTool("text"),
        toolDraw: () => changeTool("draw"),
      };
      actions[action]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewer, findOpen, closeFind, toggleFind, changeTool, openSource, save, setSidebarOpen]);

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
        openExternal(href);
      }
    };
    container.addEventListener("click", onClick, true);
    return () => container.removeEventListener("click", onClick, true);
  }, [viewer.containerRef]);

  const resolvePassword = (password: string | null) => {
    setPasswordRequest(null);
    passwordResolver.current?.(password);
    passwordResolver.current = null;
  };

  const hasDocument = !!pdfDocument && !!openDocument;

  return (
    <div className={`app${dragging ? " dragging" : ""}`}>
      <Toolbar
        hasDocument={hasDocument}
        sidebarOpen={sidebarOpen}
        findOpen={findOpen}
        darkPages={darkPages}
        pageNumber={viewer.pageNumber}
        pagesCount={viewer.pagesCount}
        scale={viewer.scale}
        scaleValue={viewer.scaleValue}
        tool={viewer.tool}
        toolColor={toolColors[viewer.tool] ?? ""}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onOpen={() => openSource(pickPdf())}
        onSave={() => save(false)}
        onPage={viewer.goToPage}
        onZoom={viewer.zoom}
        onZoomValue={viewer.setZoom}
        onRotate={viewer.rotate}
        onTool={changeTool}
        onToolColor={changeToolColor}
        onImage={() => imageInputRef.current?.click()}
        onSign={() => setSignatureOpen(true)}
        onToggleFind={() => (findOpen ? closeFind() : toggleFind())}
        onToggleDarkPages={() => setDarkPagesPreference(darkPages ? "off" : "on")}
      />
      <div className="workspace">
        {hasDocument && sidebarOpen && (
          <Sidebar
            pdfDocument={pdfDocument}
            currentPage={viewer.pageNumber}
            onSelectPage={viewer.goToPage}
            onNavigate={viewer.goToDestination}
            onOpenUrl={openExternal}
          />
        )}
        <main className={`viewer-area${darkPages ? " dark-pages" : ""}`}>
          {findOpen && hasDocument && <FindBar status={viewer.findStatus} focusToken={findFocusToken} onFind={find} onClose={closeFind} />}
          <div ref={viewer.containerRef} className="viewer-container" tabIndex={-1}>
            <div className="pdfViewer" />
          </div>
          {!hasDocument && (
            <div className="empty-state">
              <div className="empty-card">
                <h1>{loading ? "Opening…" : "Open a PDF"}</h1>
                <p>Drop a file anywhere, or</p>
                <button type="button" className="button primary" onClick={() => openSource(pickPdf())} disabled={loading}>
                  Choose file… <kbd>{isMac ? "⌘O" : "Ctrl+O"}</kbd>
                </button>
              </div>
            </div>
          )}
          {dragging && <div className="drop-overlay">Drop to open</div>}
        </main>
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            viewer.addImage(file);
          }
        }}
      />
      <SignatureDialog
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onPlace={(file) => {
          setSignatureOpen(false);
          viewer.addImage(file);
        }}
      />
      <PasswordDialog request={passwordRequest} onSubmit={resolvePassword} />
    </div>
  );
}
