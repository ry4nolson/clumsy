import { useCallback, useEffect, useRef, useState } from "react";
import { AnnotationEditorType, AnnotationMode, type PDFDocumentProxy } from "pdfjs-dist";
import { EventBus, LinkTarget, PDFLinkService, PDFViewer, ScrollMode, SpreadMode } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { attachCaretBrowsing, type CaretBrowsing } from "../lib/caretBrowsing";
import { paintDiffPage, paintDiffPages, type DiffViewer } from "../lib/diffLayer";
import type { ViewState } from "../lib/documentWindows";
import { attachHandTool, type HandTool } from "../lib/handTool";
import { restoreImages, type RenderedPageView } from "../lib/imageRestore";
import { clampStop, createNavigator, type NavDirection, type NavStop } from "../lib/navHistory";
import { hasCustomLabels } from "../lib/pageLabels";
import { PatternFindController } from "../lib/patternFindController";
import { defaultViewModes, type ScrollModeName, type SpreadModeName, type ViewModes } from "../lib/viewModes";
import { useViewerFind } from "./useViewerFind";
import { useViewerScroll, type DiffState } from "./useViewerScroll";
import { useViewerTools } from "./useViewerTools";

export type { FindMatches, FindQuery, FindStatus, FindType } from "./useViewerFind";
export type { EditorParams, EditorTool } from "./useViewerTools";

export const highlightColors = {
  yellow: "#FFFF98",
  green: "#53FFBC",
  blue: "#80EBFF",
  pink: "#FFCBE6",
  red: "#FF4F5F",
};

const scrollModeValues: Record<ScrollModeName, number> = {
  vertical: ScrollMode.VERTICAL,
  horizontal: ScrollMode.HORIZONTAL,
  wrapped: ScrollMode.WRAPPED,
  page: ScrollMode.PAGE,
};

const spreadModeValues: Record<SpreadModeName, number> = { none: SpreadMode.NONE, odd: SpreadMode.ODD, even: SpreadMode.EVEN };

const nameOf = <T extends string>(values: Record<T, number>, value: number) => (Object.keys(values) as T[]).find((key) => values[key] === value);

type ViewLocation = { pageNumber: number; left: number; top: number; rotation: number };

type EditorHost = { _layerProperties?: { annotationEditorUIManager?: { endCurrentEditing?(): void } | null } };

export type ViewStart = { view?: ViewState; modes?: Partial<ViewModes>; destination?: unknown[] | null };

let warnedAboutEditorHost = false;

const presetScales = new Set(["page-width", "page-fit", "auto"]);

type ViewerParts = {
  eventBus: EventBus;
  linkService: PDFLinkService;
  findController: PatternFindController;
  viewer: PDFViewer;
  hand: HandTool;
  caret: CaretBrowsing;
};

export function usePdfViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<ViewerParts | null>(null);
  const paintDiffRef = useRef(() => {});
  const startRef = useRef<ViewStart | null>(null);
  const locationRef = useRef<ViewLocation | null>(null);
  const modifiedRef = useRef(false);
  const editHistoryRef = useRef({ canUndo: false, canRedo: false, changed: false });
  const diffRef = useRef<DiffState>({ overlays: null, current: -1 });
  const labelsRef = useRef<string[] | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pagesCount, setPagesCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [scaleValue, setScaleValue] = useState("page-width");
  const [pagesRotation, setPagesRotation] = useState(0);
  const [modified, setModifiedState] = useState(false);
  const [modes, setModes] = useState<ViewModes>(defaultViewModes);
  const [pageLabels, setPageLabelsState] = useState<string[] | null>(null);
  const [caretBrowsing, setCaretBrowsingState] = useState(false);

  const [stops] = useState(() =>
    createNavigator(
      (): NavStop | null => {
        const location = locationRef.current;
        return location ? { page: location.pageNumber, left: location.left, top: location.top } : null;
      },
      (stop) => {
        const viewer = partsRef.current?.viewer;
        if (!viewer?.pdfDocument) {
          return;
        }
        const target = clampStop(stop, viewer.pagesCount);
        locationRef.current = { pageNumber: target.page, left: target.left ?? 0, top: target.top ?? 0, rotation: viewer.pagesRotation };
        viewer.scrollPageIntoView(
          target.top === null
            ? { pageNumber: target.page }
            : { pageNumber: target.page, destArray: [null, { name: "XYZ" }, target.left, target.top, null], allowNegativeOffset: true },
        );
      },
    ),
  );

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
    linkService.setHistory({
      pushCurrentPosition: () => stops.record(),
      push: () => {},
      pushPage: () => {},
      back: () => stops.step("back"),
      forward: () => stops.step("forward"),
    } as unknown as Parameters<PDFLinkService["setHistory"]>[0]);
    const hand = attachHandTool(container);
    const caret = attachCaretBrowsing(container);
    partsRef.current = { eventBus, linkService, findController, viewer, hand, caret };
    const paintDiff = (index: number) => paintDiffPage(viewer as unknown as DiffViewer, index, diffRef.current.overlays, diffRef.current.current);
    const paintAllDiffs = () => paintDiffPages(viewer as unknown as DiffViewer, diffRef.current.overlays, diffRef.current.current);
    paintDiffRef.current = paintAllDiffs;

    const goToDestination = async (doc: PDFDocumentProxy, dest: unknown[]) => {
      const [ref] = dest;
      const index = ref && typeof ref === "object" ? await doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0]).catch(() => -1) : Number(ref);
      if (doc === viewer.pdfDocument && Number.isInteger(index) && index >= 0 && index < viewer.pagesCount) {
        viewer.scrollPageIntoView({ pageNumber: index + 1, destArray: dest });
      }
    };

    eventBus.on("pagesinit", () => {
      const start = startRef.current;
      startRef.current = null;
      const initial = start?.view;
      const next = { ...defaultViewModes, ...start?.modes, ...(initial?.scrollMode && { scrollMode: initial.scrollMode }), ...(initial?.spreadMode && { spreadMode: initial.spreadMode }) };
      viewer.scrollMode = scrollModeValues[next.scrollMode];
      viewer.spreadMode = spreadModeValues[next.spreadMode];
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
      } else if (start?.destination && viewer.pdfDocument) {
        goToDestination(viewer.pdfDocument, start.destination);
      }
      viewer.setPageLabels(labelsRef.current);
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
    eventBus.on("scrollmodechanged", ({ mode }: { mode: number }) => {
      const scrollMode = nameOf(scrollModeValues, mode);
      if (scrollMode) {
        setModes((current) => ({ ...current, scrollMode }));
      }
    });
    eventBus.on("spreadmodechanged", ({ mode }: { mode: number }) => {
      const spreadMode = nameOf(spreadModeValues, mode);
      if (spreadMode) {
        setModes((current) => ({ ...current, spreadMode }));
      }
    });
    eventBus.on("editingstateschanged", ({ details }: { details: { hasSomethingToUndo?: boolean; hasSomethingToRedo?: boolean } }) => {
      editHistoryRef.current.canUndo = !!details.hasSomethingToUndo;
      editHistoryRef.current.canRedo = !!details.hasSomethingToRedo;
    });
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
      hand.dispose();
      caret.dispose();
      partsRef.current = null;
    };
  }, [stops]);

  const { findStatus, find, findMatches, closeFind, resetFind } = useViewerFind(partsRef);
  const tools = useViewerTools(partsRef);
  const { resetTools } = tools;
  const scroll = useViewerScroll(partsRef, containerRef, diffRef, paintDiffRef);

  const setModified = useCallback((value: boolean) => {
    modifiedRef.current = value;
    setModifiedState(value);
  }, []);

  const applyLabels = useCallback((labels: string[] | null) => {
    labelsRef.current = labels;
    setPageLabelsState(labels);
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument && viewer.pagesCount) {
      viewer.setPageLabels(labels);
    }
  }, []);

  const setDocument = useCallback(
    (doc: PDFDocumentProxy | null, start?: ViewStart) => {
      const parts = partsRef.current;
      if (!parts) {
        return;
      }
      startRef.current = start ?? null;
      locationRef.current = null;
      editHistoryRef.current = { canUndo: false, canRedo: false, changed: false };
      diffRef.current = { overlays: null, current: -1 };
      stops.reset(start?.view?.history);
      resetTools();
      setModified(false);
      setPageNumber(1);
      setPagesCount(doc?.numPages ?? 0);
      setPagesRotation(0);
      resetFind();
      applyLabels(null);
      if (doc) {
        Object.assign(doc.annotationStorage, {
          onSetModified: () => setModified(true),
          onResetModified: () => setModified(false),
        });
        doc
          .getPageLabels()
          .then((labels) => {
            if (partsRef.current?.viewer.pdfDocument === doc) {
              applyLabels(labels?.length === doc.numPages && hasCustomLabels(labels) ? labels : null);
            }
          })
          .catch(() => undefined);
      }
      parts.viewer.setDocument(doc!);
      parts.linkService.setDocument(doc, null);
      parts.findController.setDocument(doc!);
      setPdfDocument(doc);
    },
    [setModified, stops, resetFind, resetTools, applyLabels],
  );

  const recordStop = useCallback(() => {
    if (partsRef.current?.viewer.pdfDocument) {
      stops.record();
    }
  }, [stops]);

  const goToPage = useCallback(
    (page: number, record = false) => {
      const viewer = partsRef.current?.viewer;
      if (!viewer?.pdfDocument) {
        return;
      }
      const target = Math.min(Math.max(1, page), viewer.pagesCount);
      if (record && target !== viewer.currentPageNumber) {
        stops.record();
      }
      viewer.currentPageNumber = target;
    },
    [stops],
  );

  const stepPage = useCallback((direction: 1 | -1) => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument) {
      if (direction > 0) {
        viewer.nextPage();
      } else {
        viewer.previousPage();
      }
    }
  }, []);

  const navigate = useCallback((direction: NavDirection) => (partsRef.current?.viewer.pdfDocument ? stops.step(direction) : false), [stops]);

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

  const setScrollMode = useCallback((mode: ScrollModeName) => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument) {
      viewer.scrollMode = scrollModeValues[mode];
    }
  }, []);

  const setSpreadMode = useCallback((mode: SpreadModeName) => {
    const viewer = partsRef.current?.viewer;
    if (viewer?.pdfDocument) {
      viewer.spreadMode = spreadModeValues[mode];
    }
  }, []);

  const editingAction = useCallback((name: "undo" | "redo") => {
    partsRef.current?.eventBus.dispatch("editingaction", { source: null, name });
  }, []);

  const setCaretBrowsing = useCallback((enabled: boolean) => {
    partsRef.current?.caret.setEnabled(enabled);
    setCaretBrowsingState(enabled);
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
    return {
      page: location.pageNumber,
      scaleValue: viewer.currentScaleValue,
      left: location.left,
      top: location.top,
      rotation: location.rotation,
      scrollMode: nameOf(scrollModeValues, viewer.scrollMode),
      spreadMode: nameOf(spreadModeValues, viewer.spreadMode),
      history: stops.get(),
    };
  }, [stops]);

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
    pagesRotation,
    modified,
    findStatus,
    scrollMode: modes.scrollMode,
    spreadMode: modes.spreadMode,
    pageLabels,
    caretBrowsing,
    findMatches,
    setDocument,
    goToPage,
    stepPage,
    goToDestination,
    navigate,
    recordStop,
    setZoom,
    zoom,
    rotate,
    setScrollMode,
    setSpreadMode,
    editingAction,
    ...tools,
    setCaretBrowsing,
    find,
    closeFind,
    commitEdits,
    editHistory,
    viewState,
    save,
    markSaved,
    ...scroll,
  };
}

export type PdfViewerApi = ReturnType<typeof usePdfViewer>;
