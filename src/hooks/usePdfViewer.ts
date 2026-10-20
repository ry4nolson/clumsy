import { useCallback, useEffect, useRef, useState } from "react";
import { AnnotationEditorParamsType, AnnotationEditorType, AnnotationMode, type PDFDocumentProxy } from "pdfjs-dist";
import { EventBus, FindState, LinkTarget, PDFFindController, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import type { ViewState } from "../lib/documentWindows";
import { imageRects, recordImageCoordinates, recordedImages } from "../lib/imageRegions";

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

type EditorHost = { _layerProperties: { annotationEditorUIManager: { endCurrentEditing(): void } | null } };

export type FindStatus = {
  state: "idle" | "found" | "notFound" | "pending" | "wrapped";
  current: number;
  total: number;
};

export type FindQuery = {
  query: string;
  caseSensitive: boolean;
  entireWord: boolean;
};

const findStates: Record<number, FindStatus["state"]> = {
  [FindState.FOUND]: "found",
  [FindState.NOT_FOUND]: "notFound",
  [FindState.PENDING]: "pending",
  [FindState.WRAPPED]: "wrapped",
};

const presetScales = new Set(["page-width", "page-fit", "auto"]);

type RenderedPageView = {
  div: HTMLDivElement;
  canvas: HTMLCanvasElement | null;
  pdfPage: object;
  imageCoordinates: ArrayLike<number> | null;
  viewport: { rotation: number };
};

function restoreImages(pageView: RenderedPageView) {
  const { canvas, div, pdfPage, viewport } = pageView;
  recordImageCoordinates(pdfPage, pageView.imageCoordinates, viewport.rotation);
  const images = recordedImages(pdfPage);
  let overlay = div.querySelector<HTMLCanvasElement>("canvas.image-restore");
  if (!canvas || !images?.coords.length) {
    overlay?.remove();
    return;
  }
  if (!overlay) {
    overlay = document.createElement("canvas");
    overlay.className = "image-restore";
    overlay.setAttribute("aria-hidden", "true");
  }
  if (!overlay.isConnected) {
    div.querySelector(".canvasWrapper")?.after(overlay);
  }
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  const context = overlay.getContext("2d")!;
  for (const rect of imageRects(images.coords, viewport.rotation - images.rotation)) {
    const x = Math.floor(rect.x * canvas.width);
    const y = Math.floor(rect.y * canvas.height);
    const width = Math.ceil(rect.width * canvas.width);
    const height = Math.ceil(rect.height * canvas.height);
    context.drawImage(canvas, x, y, width, height, x, y, width, height);
  }
}

type ViewerParts = {
  eventBus: EventBus;
  linkService: PDFLinkService;
  findController: PDFFindController;
  viewer: PDFViewer;
};

export function usePdfViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<ViewerParts | null>(null);
  const initialViewRef = useRef<ViewState | null>(null);
  const locationRef = useRef<ViewLocation | null>(null);
  const modifiedRef = useRef(false);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pagesCount, setPagesCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [scaleValue, setScaleValue] = useState("page-width");
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
    const findController = new PDFFindController({ eventBus, linkService });
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
      }
    });
    eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => setPageNumber(pageNumber));
    eventBus.on("pagesloaded", ({ pagesCount }: { pagesCount: number }) => setPagesCount(pagesCount));
    eventBus.on("scalechanging", ({ scale, presetValue }: { scale: number; presetValue?: string }) => {
      setScale(scale);
      setScaleValue(presetValue ?? String(scale));
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
    setModified(false);
    setPageNumber(1);
    setPagesCount(doc?.numPages ?? 0);
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
    partsRef.current?.eventBus.dispatch("find", {
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

  const closeFind = useCallback(() => {
    partsRef.current?.eventBus.dispatch("findbarclose", { source: null });
    setFindStatus({ state: "idle", current: 0, total: 0 });
  }, []);

  const commitEdits = useCallback(() => {
    const viewer = partsRef.current?.viewer as unknown as EditorHost | undefined;
    viewer?._layerProperties.annotationEditorUIManager?.endCurrentEditing();
    return modifiedRef.current;
  }, []);

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
    tool,
    modified,
    findStatus,
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
    viewState,
    save,
    markSaved,
  };
}

export type PdfViewerApi = ReturnType<typeof usePdfViewer>;
