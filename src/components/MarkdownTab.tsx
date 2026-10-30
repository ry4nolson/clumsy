import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMarkdownFind } from "../hooks/useMarkdownFind";
import { imageTypeOf } from "../lib/imageFiles";
import { headingAt, headingTree, renderMarkdown, type Heading, type HeadingNode } from "../lib/markdown";
import type { ViewerScroll } from "../lib/documentMap";
import { measureBlocks, offsetWithin, renderedLineAtTop, renderedOffsetOf, sanitizeMarkdownHtml } from "../lib/markdownDom";
import type { MarkdownEditor } from "../lib/markdownEditor";
import { isTypingTarget } from "../lib/commands";
import { classifyHref, localImagePath } from "../lib/markdownLinks";
import { sourceLineAt, sourceViewport } from "../lib/markdownMap";
import { readLinkedImage, type MarkdownSource } from "../lib/platform";
import type { MarkdownMode, MarkdownViewState } from "../lib/tabs";
import { FindBar } from "./FindBar";
import { MarkdownMap } from "./MarkdownMap";
import { OutlineTree } from "./OutlineTree";
import "./Markdown.css";

export type MarkdownSnapshot = { loaded: boolean; modified: boolean; findOpen: boolean; mode: MarkdownMode };

export type MarkdownHandle = {
  text: () => string;
  markSaved: (text: string) => void;
  modified: () => boolean;
  viewState: () => MarkdownViewState;
  openFind: (query?: string) => void;
  closeFind: () => void;
  findAgain: (previous: boolean) => void;
  toggleSource: () => void;
  zoom: (step: -1 | 0 | 1) => void;
  toEdge: (top: boolean) => boolean;
  editingCommand: (name: "undo" | "redo") => boolean;
};

type MarkdownTabProps = {
  id: string;
  paneId: string;
  column: number;
  source: MarkdownSource;
  path: string | null;
  initialView?: MarkdownViewState;
  active: boolean;
  sidebarOpen: boolean;
  documentMap: boolean;
  onSnapshot: (id: string, snapshot: MarkdownSnapshot) => void;
  onLoaded: (id: string) => void;
  onOpenUrl: (url: string) => void;
  onOpenFile: (document: string, href: string) => void;
};

const ZOOM_STEPS = [0.75, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];

export const MarkdownTab = forwardRef<MarkdownHandle, MarkdownTabProps>(function MarkdownTab(
  { id, paneId, column, source, path, initialView, active, sidebarOpen, documentMap, onSnapshot, onLoaded, onOpenUrl, onOpenFile },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MarkdownEditor | null>(null);
  const editorLoading = useRef<Promise<MarkdownEditor> | null>(null);
  const textRef = useRef(source.text);
  const savedRef = useRef(source.text);
  const sourceRef = useRef(source);
  const pendingLine = useRef<number | null>(initialView?.line ?? null);
  const heldLine = useRef<number | null>(null);
  const images = useRef(new Map<string, Promise<string | null>>());
  const pathRef = useRef(path);
  pathRef.current = path;
  const unmounted = useRef(false);
  const [modified, setModified] = useState(false);
  const [renderedText, setRenderedText] = useState(source.text);
  const [mode, setMode] = useState<MarkdownMode>(initialView?.mode ?? "rendered");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [zoom, setZoom] = useState(initialView?.zoom ?? 1);
  const [topLine, setTopLine] = useState(initialView?.line ?? 0);

  const find = useMarkdownFind({
    container: containerRef,
    content: contentRef,
    editor: editorRef,
    mode: modeRef,
    text: textRef,
    onReveal: () => {
      heldLine.current = null;
    },
  });
  const refreshFind = useRef(find.refresh);
  refreshFind.current = find.refresh;

  const rendered = useMemo(() => renderMarkdown(renderedText), [renderedText]);
  const html = useMemo(() => sanitizeMarkdownHtml(rendered.html), [rendered]);
  const outline = useMemo(() => headingTree(rendered.headings), [rendered]);

  const renderedLine = useCallback(() => {
    const box = containerRef.current;
    const content = contentRef.current;
    return box && content ? renderedLineAtTop(box, content) : 0;
  }, []);

  const currentLine = useCallback(() => (modeRef.current === "source" ? (editorRef.current?.lineAtTop() ?? 0) : renderedLine()), [renderedLine]);

  const scrollRendered = useCallback((line: number) => {
    const box = containerRef.current;
    const content = contentRef.current;
    if (box && content) {
      box.scrollTop = renderedOffsetOf(box, content, line);
      heldLine.current = line;
    }
  }, []);

  const changeText = useCallback((text: string) => {
    textRef.current = text;
    setModified(text !== savedRef.current);
    if (modeRef.current === "source") {
      refreshFind.current();
    }
  }, []);

  const ensureEditor = useCallback(() => {
    if (editorRef.current) {
      return Promise.resolve(editorRef.current);
    }
    editorLoading.current ??= import("../lib/markdownEditor").then(({ createMarkdownEditor }) => {
      const editor = createMarkdownEditor(editorHostRef.current!, textRef.current, changeText);
      if (unmounted.current) {
        editor.destroy();
      } else {
        editorRef.current = editor;
      }
      return editor;
    });
    return editorLoading.current;
  }, [changeText]);

  useEffect(() => {
    onLoaded(id);
    if (initialView?.mode === "source") {
      ensureEditor().then((editor) => editor.scrollToLine(initialView.line));
    }
    const loaded = images.current;
    return () => {
      unmounted.current = true;
      editorRef.current?.destroy();
      loaded.forEach((url) => url.then((value) => value && URL.revokeObjectURL(value)));
    };
  }, []);

  useEffect(() => {
    if (source === sourceRef.current) {
      return;
    }
    sourceRef.current = source;
    const line = initialView?.line ?? currentLine();
    textRef.current = source.text;
    savedRef.current = source.text;
    setModified(false);
    editorRef.current?.setText(source.text);
    if (modeRef.current === "source") {
      editorRef.current?.scrollToLine(line);
    }
    pendingLine.current = line;
    setRenderedText(source.text);
  }, [source]);

  const loadImages = useCallback((root: HTMLElement) => {
    const path = pathRef.current;
    root.querySelectorAll<HTMLImageElement>("img[data-local-src]").forEach((image) => {
      const src = image.dataset.localSrc!;
      const fallback = () => {
        const missing = document.createElement("span");
        missing.className = "missing-image";
        missing.textContent = image.alt || src;
        image.replaceWith(missing);
      };
      if (!path) {
        fallback();
        return;
      }
      const key = `${path}\n${src}`;
      let url = images.current.get(key);
      if (!url) {
        const file = localImagePath(src);
        url = readLinkedImage(path, file)
          .then((bytes) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: imageTypeOf(file) })))
          .catch(() => null);
        images.current.set(key, url);
      }
      url.then((value) => (value ? (image.src = value) : fallback()));
    });
  }, []);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) {
      return;
    }
    content.innerHTML = html;
    loadImages(content);
    if (pendingLine.current !== null) {
      scrollRendered(pendingLine.current);
      pendingLine.current = null;
    }
    refreshFind.current();
  }, [html, loadImages, scrollRendered]);

  useEffect(() => {
    const box = containerRef.current;
    const content = contentRef.current;
    if (!box || !content) {
      return;
    }
    const release = () => {
      heldLine.current = null;
    };
    const observer = new ResizeObserver(() => {
      if (heldLine.current !== null && modeRef.current === "rendered") {
        box.scrollTop = renderedOffsetOf(box, content, heldLine.current);
      }
    });
    observer.observe(content);
    box.addEventListener("wheel", release, { passive: true });
    box.addEventListener("pointerdown", release);
    box.addEventListener("keydown", release);
    return () => {
      observer.disconnect();
      box.removeEventListener("wheel", release);
      box.removeEventListener("pointerdown", release);
      box.removeEventListener("keydown", release);
    };
  }, []);

  useEffect(() => {
    if (!sidebarOpen) {
      return;
    }
    let frame = 0;
    const track = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTopLine(currentLine()));
    };
    track();
    const box = containerRef.current;
    const scroller = editorHostRef.current;
    box?.addEventListener("scroll", track, { passive: true });
    scroller?.addEventListener("scroll", track, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      box?.removeEventListener("scroll", track);
      scroller?.removeEventListener("scroll", track, { capture: true });
    };
  }, [sidebarOpen, mode, currentLine]);

  const toggleSource = useCallback(() => {
    if (modeRef.current === "rendered") {
      const line = renderedLine();
      heldLine.current = null;
      setMode("source");
      ensureEditor().then((editor) => {
        editor.scrollToLine(line);
        editor.placeCursorAtLine(line);
        editor.focus();
        refreshFind.current();
      });
      return;
    }
    const line = editorRef.current?.lineAtTop() ?? 0;
    setMode("rendered");
    containerRef.current?.focus({ preventScroll: true });
    if (textRef.current !== renderedText) {
      pendingLine.current = line;
      setRenderedText(textRef.current);
    } else {
      scrollRendered(line);
    }
  }, [ensureEditor, renderedLine, renderedText, scrollRendered]);

  useEffect(() => {
    refreshFind.current();
  }, [mode]);

  const changeZoom = useCallback(
    (step: -1 | 0 | 1) => {
      const line = currentLine();
      setZoom((current) => {
        const index = ZOOM_STEPS.indexOf(current);
        return step === 0 ? 1 : ZOOM_STEPS[Math.min(Math.max((index < 0 ? 2 : index) + step, 0), ZOOM_STEPS.length - 1)];
      });
      pendingLine.current = line;
    },
    [currentLine],
  );

  useLayoutEffect(() => {
    if (pendingLine.current === null) {
      return;
    }
    const line = pendingLine.current;
    pendingLine.current = null;
    if (modeRef.current === "source") {
      editorRef.current?.measure();
      editorRef.current?.scrollToLine(line);
    } else {
      scrollRendered(line);
    }
  }, [zoom, scrollRendered]);

  const mapView = useCallback((): ViewerScroll | null => {
    const box = containerRef.current;
    const content = contentRef.current;
    if (!box || !content) {
      return null;
    }
    if (modeRef.current === "rendered") {
      return { scrollTop: box.scrollTop, clientHeight: box.clientHeight, scrollHeight: box.scrollHeight };
    }
    const editor = editorRef.current;
    return editor ? sourceViewport(measureBlocks(box, content), editor.visibleLines(), box.scrollHeight) : null;
  }, []);

  const mapScrollTo = useCallback((scrollTop: number) => {
    const box = containerRef.current;
    const content = contentRef.current;
    if (!box || !content) {
      return;
    }
    if (modeRef.current === "rendered") {
      heldLine.current = null;
      box.scrollTop = scrollTop;
    } else {
      editorRef.current?.scrollToLine(sourceLineAt(measureBlocks(box, content), scrollTop));
    }
  }, []);

  const mapScrollBy = useCallback((delta: number) => {
    if (modeRef.current === "rendered") {
      heldLine.current = null;
      containerRef.current?.scrollBy({ top: delta });
    } else {
      editorRef.current?.scrollBy(delta);
    }
  }, []);

  const goToHeading = useCallback(
    (heading: Heading) => {
      if (modeRef.current === "source") {
        editorRef.current?.scrollToLine(heading.line);
        return;
      }
      const box = containerRef.current;
      const target = contentRef.current?.querySelector(`[id="${CSS.escape(heading.id)}"]`);
      if (box && target) {
        heldLine.current = null;
        box.scrollTop = offsetWithin(box, target) - 12;
      }
    },
    [],
  );

  const onContentClick = (event: React.MouseEvent) => {
    const link = (event.target as Element).closest("a, area");
    if (!link) {
      return;
    }
    event.preventDefault();
    const target = classifyHref(link.getAttribute("href"));
    if (target.kind === "external") {
      onOpenUrl(target.url);
    } else if (target.kind === "file" && path) {
      onOpenFile(path, target.path);
    } else if (target.kind === "anchor") {
      const box = containerRef.current;
      const element = contentRef.current?.querySelector(`[id="${CSS.escape(target.id)}"], [name="${CSS.escape(target.id)}"]`);
      if (box && element) {
        heldLine.current = null;
        box.scrollTop = offsetWithin(box, element) - 12;
      }
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      text: () => textRef.current,
      markSaved: (text) => {
        savedRef.current = text;
        setModified(textRef.current !== text);
      },
      modified: () => textRef.current !== savedRef.current,
      viewState: () => ({ mode: modeRef.current, line: currentLine(), zoom }),
      openFind: find.openFind,
      closeFind: find.closeFind,
      findAgain: find.findAgain,
      toggleSource,
      zoom: changeZoom,
      toEdge: (top) => {
        if (modeRef.current === "source") {
          editorRef.current?.toEdge(top);
          return true;
        }
        const box = containerRef.current;
        if (box) {
          heldLine.current = null;
          box.scrollTop = top ? 0 : box.scrollHeight;
        }
        return true;
      },
      editingCommand: (name) => {
        const editor = editorRef.current;
        if (modeRef.current !== "source" || !editor || (!editor.hasFocus() && isTypingTarget(document.activeElement))) {
          return false;
        }
        (name === "undo" ? editor.undo : editor.redo)();
        return true;
      },
    }),
    [changeZoom, currentLine, find.closeFind, find.findAgain, find.openFind, toggleSource, zoom],
  );

  useEffect(() => {
    onSnapshot(id, { loaded: true, modified, findOpen: find.findOpen, mode });
  }, [id, modified, find.findOpen, mode, onSnapshot]);

  const currentHeading = sidebarOpen ? headingAt(rendered.headings, topLine + 0.5) : null;
  const findNode = (nodes: HeadingNode[]): HeadingNode | null => {
    for (const node of nodes) {
      if (node.id === currentHeading?.id) {
        return node;
      }
      const inner = findNode(node.items);
      if (inner) {
        return inner;
      }
    }
    return null;
  };

  return (
    <div
      className={`document-tab markdown-tab${active ? "" : " inactive"}`}
      inert={!active}
      data-pane-id={paneId}
      data-tab-id={id}
      style={{ gridColumn: column, ["--md-zoom" as string]: zoom }}
    >
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="sidebar-tabs" role="tablist">
            <button type="button" role="tab" aria-selected>
              Outline
            </button>
          </div>
          <div className="sidebar-content">
            {outline.length ? (
              <OutlineTree nodes={outline} current={findNode(outline)} onActivate={goToHeading} />
            ) : (
              <p className="sidebar-empty">This document has no headings.</p>
            )}
          </div>
        </aside>
      )}
      <main className="viewer-area markdown-area">
        {find.findOpen && (
          <FindBar status={find.status} focusToken={find.focusToken} seed={find.seed} onFind={find.find} onClose={find.closeFind} />
        )}
        <div
          ref={containerRef}
          className={`viewer-container markdown-rendered${mode === "rendered" ? "" : " hidden-mode"}`}
          tabIndex={-1}
          inert={mode !== "rendered"}
        >
          <article ref={contentRef} className="markdown-body" onClick={onContentClick} />
        </div>
        <div ref={editorHostRef} className={`markdown-source${mode === "source" ? "" : " hidden-mode"}`} inert={mode !== "source"} />
      </main>
      {documentMap && (
        <MarkdownMap
          content={contentRef}
          container={containerRef}
          editorHost={editorHostRef}
          mode={mode}
          view={mapView}
          scrollTo={mapScrollTo}
          scrollBy={mapScrollBy}
        />
      )}
    </div>
  );
});
