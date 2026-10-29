import { useCallback, useEffect, useRef, useState } from "react";
import { AnnotationEditorParamsType, AnnotationEditorType, AnnotationMode, type PDFDocumentProxy } from "pdfjs-dist";
import { EventBus, FindState, LinkTarget, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import type { PageOverlay } from "../lib/comparison";
import type { PageRect } from "../lib/diffRects";
import { markCurrentChange, paintDiffPage, paintDiffPages, type DiffViewer } from "../lib/diffLayer";
import type { ViewState } from "../lib/documentWindows";
import { compileFindPattern } from "../lib/findPattern";
import { restoreImages, type RenderedPageView } from "../lib/imageRestore";
import { PatternFindController } from "../lib/patternFindController";
import type { ScrollLocation } from "../lib/scrollSync";
import { revealRect, scrollLocation, scrollToLocation, type ScrollableViewer } from "../lib/viewerScroll";

export const highlightColors = {
  yellow: "#FFFF98",
  green: "#53FFBC",
  blue: "#80EBFF",
  pink: "#FFCBE6",
  red: "#FF4F5F",
};

export type EditorTool = "select" | "highlight" | "text" | "draw" | "image";

const toolModes: Record<EditorTool, number> = {
  select: AnnotationEditorType.NONE,
  highlight: AnnotationEditorType.HIGHLIGHT,
  text: AnnotationEditorType.FREETEXT,
  draw: AnnotationEditorType.INK,
  image: AnnotationEditorType.STAMP,
};

type ViewLocation = { pageNumber: number; left: number; top: number; rotation: number };

type EditorHost = { _layerProperties?: { annotationEditorUIManager?: { endCurrentEditing?(): void } | null } };

let warnedAboutEditorHost = false;

export type FindStatus = {
  state: "idle" | "found" | "notFound" | "pending" | "wrapped";
  current: number;
  total: number;
};

export type FindMatches = { positions: number[][]; lengths: number[][]; selected: { pageIdx: number; matchIdx: number } };

export type FindQuery = {
  query: string;
  caseSensitive: boolean;
  entireWord: boolean;
  regex: boolean;
};

const findStates: Record<number, FindStatus["state"]> = {
  [FindState.FOUND]: "found",
  [FindState.NOT_FOUND]: "notFound",
  [FindState.PENDING]: "pending",
  [FindState.WRAPPED]: "wrapped",
};

const presetScales = new Set(["page-width", "page-fit", "auto"]);

type ViewerParts = {
  eventBus: EventBus;
  linkService: PDFLinkService;
  findController: PatternFindController;
  viewer: PDFViewer;
};

export function usePdfViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<ViewerParts | null>(null);
  const paintDiffRef = useRef(() => {});
  const initialViewRef = useRef<ViewState | null>(null);
  const locationRef = useRef<ViewLocation | null>(null);
  const modifiedRef = useRef(false);
  const editHistoryRef = useRef({ canUndo: false, canRedo: false, changed: false });
  const diffRef = useRef<{ overlays: Map<number, PageOverlay> | null; current: number }>({ overlays: null, current: -1 });
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pagesCount, setPagesCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [scaleValue, setScaleValue] = useState("page-width");
  const [pagesRotation, setPagesRotation] = useState(0);
  const [tool, setToolState] = useState<EditorTool>("select");
  const [modified, setModifiedState] = useState(false);
  const [findStatus, setFindStatus] = useState<FindStatus>({ state: "idle", current: 0, total: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const viewerElement = container.querySelector<HTMLDivElement>(".pdfViewer")!;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus, externalLinkTarget: LinkTarget.BLANK });
    const findController = new PatternFindController({ eventBus, linkService });
    const viewer = new PDFViewer({
      container,
      viewer: viewerElement,
      eventBus,
      linkService,
      findController,
      annotationMode: AnnotationMode.ENABLE_FORMS,
      annotationEditorMode: AnnotationEditorType.NONE,
      annotationEditorHighlightColors: Object.entries(highlightColors)
        .map(([name, hex]) => `${name}=${hex}`)
        .join(","),
      enableHighlightFloatingButton: true,
      imagesRightClickMinSize: 0,
      enableDetailCanvas: false,
      imageResourcesPath: "",
    } as ConstructorParameters<typeof PDFViewer>[0]);
    linkService.setViewer(viewer);
    partsRef.current = { eventBus, linkService, findController, viewer };
    const paintDiff = (index: number) => paintDiffPage(viewer as unknown as DiffViewer, index, diffRef.current.overlays, diffRef.current.current);
    const paintAllDiffs = () => paintDiffPages(viewer as unknown as DiffViewer, diffRef.current.overlays, diffRef.current.current);
    paintDiffRef.current = paintAllDiffs;

    eventBus.on("pagesinit", () => {
      const initial = initialViewRef.current;
      initialViewRef.current = null;
      if (initial?.rotation) {
        viewer.pagesRotation = initial.rotation;
      }
      viewer.currentScaleValue = initial?.scaleValue || "page-width";
      if (initial) {
        viewer.scrollPageIntoView({
          pageNumber: Math.min(initial.page, viewer.pagesCount),
          destArray: [null, { name: "XYZ" }, initial.left, initial.top, null],
          allowNegativeOffset: true,
        });
      }
    });
    eventBus.on("updateviewarea", ({ location }: { location: ViewLocation }) => {
      locationRef.current = location;
    });
    eventBus.on("pagerendered", ({ source, isDetailView, error }: { source: RenderedPageView; isDetailView: boolean; error: unknown }) => {
      if (!isDetailView && !error) {
        restoreImages(source);
        paintDiff(source.id - 1);
      }
    });
    eventBus.on("rotationchanging", ({ pagesRotation }: { pagesRotation: number }) => {
      setPagesRotation(pagesRotation);
      paintAllDiffs();
    });
    eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => setPageNumber(pageNumber));
    eventBus.on("pagesloaded", ({ pagesCount }: { pagesCount: number }) => setPagesCount(pagesCount));
    eventBus.on("scalechanging", ({ scale, presetValue }: { scale: number; presetValue?: string }) => {
      setScale(scale);
      setScaleValue(presetValue ?? String(scale));
      paintAllDiffs();
    });
    eventBus.on("editingstateschanged", ({ details }: { details: { hasSomethingToUndo?: boolean; hasSomethingToRedo?: boolean } }) => {
      editHistoryRef.current.canUndo = !!details.hasSomethingToUndo;
      editHistoryRef.current.canRedo = !!details.hasSomethingToRedo;
    });
    eventBus.on("annotationeditormodechanged", ({ mode }: { mode: number }) => {
      const match = (Object.keys(toolModes) as EditorTool[]).find((key) => toolModes[key] === mode);
      setToolState(match ?? "select");
    });
    const onFindUpdate = ({ state, matchesCount }: { state?: number; matchesCount: { current: number; total: number } }) => {
      setFindStatus((previous) => ({
        state: state === undefined ? previous.state : (findStates[state] ?? "idle"),
        current: matchesCount.current,
        total: matchesCount.total,
      }));
    };
    eventBus.on("updatefindcontrolstate", onFindUpdate);
    eventBus.on("updatefindmatchescount", onFindUpdate);

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      viewer.updateScale({
        drawingDelay: 400,
        scaleFactor: Math.exp(-event.deltaY / 100),
        origin: [event.clientX, event.clientY],
      });
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    const onFormInput = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest?.(".annotationLayer")) {
        editHistoryRef.current.changed = true;
      }
    };
    container.addEventListener("input", onFormInput, true);
    container.addEventListener("change", onFormInput, true);

    let lastSize = "";
    const resizeObserver = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0];
      const width = Math.round(box?.inlineSize ?? container.offsetWidth);
      const height = Math.round(box?.blockSize ?? container.offsetHeight);
      const size = `${width}x${height}`;
      if (!width || !height || size === lastSize) {
        return;
      }
      lastSize = size;
      const preset = viewer.currentScaleValue;
      if (viewer.pdfDocument && presetScales.has(preset)) {
        viewer.currentScaleValue = preset;
      }
    });
    resizeObserver.observe(container, { box: "border-box" });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("input", onFormInput, true);
      container.removeEventListener("change", onFormInput, true);
      partsRef.current = null;
    };
  }, []);

  const setModified = useCallback((value: boolean) => {
    modifiedRef.current = value;
    setModifiedState(value);
  }, []);

  const setDocument = useCallback((doc: PDFDocumentProxy | null, initialView?: ViewState) => {
    const parts = partsRef.current;
    if (!parts) {
      return;
    }
    initialViewRef.current = initialView ?? null;
    locationRef.current = null;
    editHistoryRef.current = { canUndo: false, canRedo: false, changed: false };
    diffRef.current = { overlays: null, current: -1 };
    setModified(false);
    setPageNumber(1);
    setPagesCount(doc?.numPages ?? 0);
    setPagesRotation(0);
    setToolState("select");
    setFindStatus({ state: "idle", current: 0, total: 0 });
    if (doc) {
      Object.assign(doc.annotationStorage, {
        onSetModified: () => setModified(true),
        onResetModified: () => setModified(false),
      });
    }
    parts.viewer.setDocument(doc!);
    parts.linkService.setDocument(doc, null);
    parts.findController.setDocument(doc!);
    setPdfDocument(doc);
  }, [setModified]);

  const goToPage = useCallback((page: number) => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument) {
      viewer.currentPageNumber = Math.min(Math.max(1, page), viewer.pagesCount);
    }
  }, []);

  const goToDestination = useCallback((dest: unknown) => {
    partsRef.current?.linkService.goToDestination(dest as string);
  }, []);

  const setZoom = useCallback((value: string | number) => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument) {
      viewer.currentScaleValue = String(value);
    }
  }, []);

  const zoom = useCallback((direction: 1 | -1) => {
    const viewer = partsRef.current?.viewer;
    if (!viewer?.pdfDocument) {
      return;
    }
    if (direction > 0) {
      viewer.increaseScale();
    } else {
      viewer.decreaseScale();
    }
  }, []);

  const rotate = useCallback((direction: 1 | -1 = 1) => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument) {
      viewer.pagesRotation = (viewer.pagesRotation + 90 * direction + 360) % 360;
    }
  }, []);

  const editingAction = useCallback((name: "undo" | "redo") => {
    partsRef.current?.eventBus.dispatch("editingaction", { source: null, name });
  }, []);

  const setTool = useCallback((next: EditorTool) => {
    const parts = partsRef.current;
    if (!parts?.viewer.pdfDocument) {
      return Promise.resolve();
    }
    const mode = toolModes[next];
    if ((parts.viewer.annotationEditorMode as unknown as number) === mode) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const done = ({ mode: changed }: { mode: number }) => {
        if (changed === mode) {
          parts.eventBus.off("annotationeditormodechanged", done);
          resolve();
        }
      };
      parts.eventBus.on("annotationeditormodechanged", done);
      parts.viewer.annotationEditorMode = { mode };
    });
  }, []);

  const setEditorParam = useCallback((type: number, value: unknown) => {
    partsRef.current?.eventBus.dispatch("switchannotationeditorparams", { source: null, type, value });
  }, []);

  const addImage = useCallback(
    async (file?: File) => {
      await setTool("image");
      setEditorParam(AnnotationEditorParamsType.CREATE, file ? { bitmapFile: file } : {});
    },
    [setTool, setEditorParam],
  );

  const find = useCallback((query: FindQuery, type: "" | "again" | "casesensitivitychange" | "entirewordchange", findPrevious = false) => {
    const parts = partsRef.current;
    if (!parts) {
      return;
    }
    const pattern = query.regex ? compileFindPattern(query.query, query.caseSensitive) : null;
    if (query.regex && query.query && !pattern) {
      parts.eventBus.dispatch("findbarclose", { source: null });
      return;
    }
    parts.findController.pattern = pattern;
    parts.findController.patternEntireWord = query.entireWord;
    parts.eventBus.dispatch("find", {
      source: null,
      type,
      query: query.query,
      caseSensitive: query.caseSensitive,
      entireWord: query.entireWord,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    });
  }, []);

  const findMatches = useCallback((): FindMatches | null => {
    const controller = partsRef.current?.findController;
    if (!controller?.highlightMatches || !controller.pageMatches) {
      return null;
    }
    return { positions: controller.pageMatches, lengths: controller.pageMatchesLength ?? [], selected: controller.selected ?? { pageIdx: -1, matchIdx: -1 } };
  }, []);

  const closeFind = useCallback(() => {
    partsRef.current?.eventBus.dispatch("findbarclose", { source: null });
    setFindStatus({ state: "idle", current: 0, total: 0 });
  }, []);

  const commitEdits = useCallback(() => {
    const viewer = partsRef.current?.viewer as unknown as EditorHost | undefined;
    const manager = viewer?._layerProperties?.annotationEditorUIManager;
    if (viewer && manager?.endCurrentEditing) {
      manager.endCurrentEditing();
    } else if (viewer && manager !== null && !warnedAboutEditorHost) {
      warnedAboutEditorHost = true;
      console.warn("pdf.js changed: can't finish in-progress edits before saving");
    }
    return modifiedRef.current;
  }, []);

  const editHistory = useCallback(() => {
    commitEdits();
    return { ...editHistoryRef.current };
  }, [commitEdits]);

  const viewState = useCallback((): ViewState | null => {
    const viewer = partsRef.current?.viewer;
    const location = locationRef.current;
    if (!viewer?.pdfDocument || !location) {
      return null;
    }
    return { page: location.pageNumber, scaleValue: viewer.currentScaleValue, left: location.left, top: location.top, rotation: location.rotation };
  }, []);

  const save = useCallback(async () => {
    const doc = partsRef.current?.viewer.pdfDocument;
    if (!doc) {
      return null;
    }
    commitEdits();
    return doc.saveDocument();
  }, [commitEdits]);

  const setDiffOverlays = useCallback((overlays: Map<number, PageOverlay> | null) => {
    const previous = diffRef.current.overlays;
    diffRef.current.overlays = overlays;
    if (previous) {
      containerRef.current?.querySelectorAll(".diff-layer").forEach((layer) => layer.remove());
    }
    if (overlays) {
      paintDiffRef.current();
    }
  }, []);

  const setCurrentChange = useCallback((current: number) => {
    diffRef.current.current = current;
    if (containerRef.current) {
      markCurrentChange(containerRef.current, current);
    }
  }, []);

  const scrollView = useCallback(<T,>(run: (viewer: ScrollableViewer, container: HTMLElement) => T): T | null => {
    const viewer = partsRef.current?.viewer;
    const container = containerRef.current;
    return viewer?.pdfDocument && viewer.pagesCount && container ? run(viewer as unknown as ScrollableViewer, container) : null;
  }, []);

  const scrollPosition = useCallback(() => scrollView((viewer, container) => scrollLocation(viewer, container)), [scrollView]);
  const readingPosition = useCallback(() => scrollView((viewer, container) => scrollLocation(viewer, container, container.clientHeight / 3)), [scrollView]);
  const scrollTo = useCallback((location: ScrollLocation) => scrollView((viewer, container) => scrollToLocation(viewer, container, location)), [scrollView]);
  const reveal = useCallback((rect: PageRect) => scrollView((viewer, container) => revealRect(viewer, container, rect)), [scrollView]);
  const rotation = useCallback(() => partsRef.current?.viewer.pagesRotation ?? 0, []);

  const markSaved = useCallback(() => {
    partsRef.current?.viewer.pdfDocument?.annotationStorage.resetModified();
    setModified(false);
  }, [setModified]);

  return {
    containerRef,
    pdfDocument,
    pageNumber,
    pagesCount,
    scale,
    scaleValue,
    pagesRotation,
    tool,
    modified,
    findStatus,
    findMatches,
    setDocument,
    goToPage,
    goToDestination,
    setZoom,
    zoom,
    rotate,
    editingAction,
    setTool,
    setEditorParam,
    addImage,
    find,
    closeFind,
    commitEdits,
    editHistory,
    viewState,
    save,
    markSaved,
    setDiffOverlays,
    setCurrentChange,
    scrollPosition,
    readingPosition,
    scrollTo,
    reveal,
    rotation,
  };
}

export type PdfViewerApi = ReturnType<typeof usePdfViewer>;
