import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnnotationEditorParamsType, AnnotationEditorType } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { EditorManagers } from "../lib/editorManagers";
import type { HandTool } from "../lib/handTool";
import { attachMarkPlacement, type MarkPlacement } from "../lib/markPlacement";
import type { MarkKind } from "../lib/marks";

export type EditorTool = "select" | "hand" | "highlight" | "text" | "draw" | "image" | "signature" | "comment" | "mark";

export type EditorParams = Record<number, unknown>;

const toolModes: Record<Exclude<EditorTool, "hand" | "mark">, number> = {
  select: AnnotationEditorType.NONE,
  highlight: AnnotationEditorType.HIGHLIGHT,
  text: AnnotationEditorType.FREETEXT,
  draw: AnnotationEditorType.INK,
  image: AnnotationEditorType.STAMP,
  signature: AnnotationEditorType.SIGNATURE,
  comment: AnnotationEditorType.POPUP,
};

const markMode = (kind: MarkKind) => (kind === "date" ? AnnotationEditorType.FREETEXT : AnnotationEditorType.SIGNATURE);

type EditorLayerPage = { annotationEditorLayer?: { annotationEditorLayer?: unknown } | null };

type DrawingLayerPage = { annotationEditorLayer?: { annotationEditorLayer?: { commitOrRemove?(): boolean } | null } | null };

type DrawingHost = { _layerProperties?: { annotationEditorUIManager?: { unselectAll?(): void } | null } };

type ToolParts = { eventBus: EventBus; viewer: PDFViewer; hand: HandTool; editorUi: EditorManagers };

const sessionParams = new Set<number>([AnnotationEditorParamsType.CREATE, AnnotationEditorParamsType.HIGHLIGHT_SHOW_ALL]);

function finishDrawing(viewer: PDFViewer) {
  let finished = false;
  for (let index = 0; index < viewer.pagesCount; index++) {
    const layer = (viewer.getPageView(index) as DrawingLayerPage | undefined)?.annotationEditorLayer?.annotationEditorLayer;
    finished = !!layer?.commitOrRemove?.() || finished;
  }
  if (finished) {
    (viewer as unknown as DrawingHost)._layerProperties?.annotationEditorUIManager?.unselectAll?.();
  }
}

export function useViewerTools(partsRef: RefObject<ToolParts | null>) {
  const editorDefaultsRef = useRef<EditorParams>({});
  const handRef = useRef({ tool: false, held: false });
  const selectedRef = useRef(false);
  const layersRef = useRef({ ready: false, waiting: [] as Array<() => void> });
  const markRef = useRef<{ kind: MarkKind | null; placement: MarkPlacement | null }>({ kind: null, placement: null });
  const [editorTool, setEditorTool] = useState<EditorTool>("select");
  const [mark, setMarkState] = useState<MarkKind | null>(null);
  const [handTool, setHandTool] = useState(false);
  const [editorParams, setEditorParams] = useState<EditorParams>({});
  const [selectedEditor, setSelectedEditor] = useState(false);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts) {
      return;
    }
    const { eventBus, hand, viewer } = parts;
    const placement = attachMarkPlacement(viewer.container, viewer);
    markRef.current.placement = placement;
    const onPointerDown = ({ target, isPrimary }: PointerEvent) => {
      const ink = (viewer.annotationEditorMode as unknown as number) === AnnotationEditorType.INK;
      if (ink && isPrimary && target instanceof HTMLElement && target.classList.contains("annotationEditorLayer")) {
        target.dispatchEvent(new PointerEvent("pointerup", { button: 0 }));
      }
    };
    viewer.container.addEventListener("pointerdown", onPointerDown, true);
    const onStates = ({ details }: { details: { hasSelectedEditor?: boolean } }) => {
      if (details.hasSelectedEditor !== undefined) {
        selectedRef.current = details.hasSelectedEditor;
        setSelectedEditor(details.hasSelectedEditor);
      }
    };
    const onParams = ({ details }: { details: Array<[number, unknown]> }) => {
      setEditorParams((current) => ({ ...current, ...Object.fromEntries(details) }));
    };
    const onMode = ({ mode }: { mode: number }) => {
      const match = (Object.keys(toolModes) as Array<keyof typeof toolModes>).find((key) => toolModes[key] === mode);
      setEditorTool(match ?? "select");
      const { kind } = markRef.current;
      if (kind && markMode(kind) !== mode) {
        markRef.current.kind = null;
        placement.setMark(null);
        setMarkState(null);
      }
      if (mode === AnnotationEditorType.NONE) {
        return;
      }
      handRef.current.tool = false;
      setHandTool(false);
      hand.setActive(handRef.current.held);
      if (selectedRef.current) {
        return;
      }
      for (const [type, value] of Object.entries(editorDefaultsRef.current)) {
        eventBus.dispatch("switchannotationeditorparams", { source: null, type: Number(type), value });
      }
    };
    const onShowEditorUi = ({ mode }: { mode: number }) => {
      viewer.annotationEditorMode = { mode };
    };
    const onEditorLayer = ({ source, pageNumber }: { source: EditorLayerPage; pageNumber: number }) => {
      if (viewer.getPageView(pageNumber - 1) !== source || !source.annotationEditorLayer?.annotationEditorLayer) {
        return;
      }
      layersRef.current.ready = true;
      layersRef.current.waiting.splice(0).forEach((resolve) => resolve());
    };
    eventBus.on("editingstateschanged", onStates);
    eventBus.on("annotationeditorparamschanged", onParams);
    eventBus.on("annotationeditormodechanged", onMode);
    eventBus.on("showannotationeditorui", onShowEditorUi);
    eventBus.on("annotationeditorlayerrendered", onEditorLayer);
    return () => {
      eventBus.off("editingstateschanged", onStates);
      eventBus.off("annotationeditorparamschanged", onParams);
      eventBus.off("annotationeditormodechanged", onMode);
      eventBus.off("showannotationeditorui", onShowEditorUi);
      eventBus.off("annotationeditorlayerrendered", onEditorLayer);
      placement.dispose();
      markRef.current.placement = null;
      viewer.container.removeEventListener("pointerdown", onPointerDown, true);
      finishDrawing(viewer);
    };
  }, [partsRef]);

  const showMark = useCallback((kind: MarkKind | null) => {
    markRef.current.kind = kind;
    markRef.current.placement?.setMark(kind);
    setMarkState(kind);
  }, []);

  const resetTools = useCallback(() => {
    handRef.current.tool = false;
    selectedRef.current = false;
    layersRef.current.ready = false;
    showMark(null);
    partsRef.current?.hand.setActive(handRef.current.held);
    setEditorTool("select");
    setHandTool(false);
    setSelectedEditor(false);
    setEditorParams({});
  }, [partsRef, showMark]);

  const editorLayerReady = useCallback(() => {
    const layers = layersRef.current;
    return layers.ready ? Promise.resolve() : new Promise<void>((resolve) => layers.waiting.push(resolve));
  }, []);

  const setEditorMode = useCallback(
    async (mode: number) => {
      if (mode !== AnnotationEditorType.NONE) {
        await editorLayerReady();
      }
      const parts = partsRef.current;
      if (!parts?.viewer.pdfDocument || (parts.viewer.annotationEditorMode as unknown as number) === mode) {
        return;
      }
      await new Promise<void>((resolve) => {
        const done = ({ mode: changed }: { mode: number }) => {
          if (changed === mode) {
            parts.eventBus.off("annotationeditormodechanged", done);
            resolve();
          }
        };
        parts.eventBus.on("annotationeditormodechanged", done);
        parts.viewer.annotationEditorMode = { mode };
      });
    },
    [partsRef, editorLayerReady],
  );

  const setTool = useCallback(
    async (next: EditorTool) => {
      const parts = partsRef.current;
      if (!parts?.viewer.pdfDocument || next === "mark") {
        return;
      }
      showMark(null);
      await setEditorMode(next === "hand" ? AnnotationEditorType.NONE : toolModes[next]);
      handRef.current.tool = next === "hand";
      setHandTool(next === "hand");
      parts.hand.setActive(handRef.current.tool || handRef.current.held);
    },
    [partsRef, setEditorMode, showMark],
  );

  const setMark = useCallback(
    async (kind: MarkKind) => {
      const parts = partsRef.current;
      if (!parts?.viewer.pdfDocument) {
        return;
      }
      showMark(kind);
      markRef.current.placement?.setMark(null);
      await setEditorMode(markMode(kind));
      if (markRef.current.kind !== kind) {
        return;
      }
      markRef.current.placement?.setMark(kind);
      handRef.current.tool = false;
      setHandTool(false);
      parts.hand.setActive(handRef.current.held);
    },
    [partsRef, setEditorMode, showMark],
  );

  const holdHand = useCallback(
    (held: boolean) => {
      const parts = partsRef.current;
      if (!parts?.viewer.pdfDocument || handRef.current.held === held) {
        return false;
      }
      const moved = parts.hand.moved();
      handRef.current.held = held;
      parts.hand.setActive(handRef.current.tool || held);
      return held || moved;
    },
    [partsRef],
  );

  const endDrawing = useCallback(() => {
    const viewer = partsRef.current?.viewer;
    if (viewer) {
      finishDrawing(viewer);
    }
  }, [partsRef]);

  const setEditorParam = useCallback(
    (type: number, value: unknown) => {
      const parts = partsRef.current;
      if (!parts) {
        return;
      }
      if (!sessionParams.has(type)) {
        finishDrawing(parts.viewer);
      }
      parts.eventBus.dispatch("switchannotationeditorparams", { source: null, type, value });
      if (type === AnnotationEditorParamsType.HIGHLIGHT_SHOW_ALL) {
        setEditorParams((current) => ({ ...current, [type]: value }));
      }
    },
    [partsRef],
  );

  const setEditorDefaults = useCallback((params: EditorParams) => {
    editorDefaultsRef.current = params;
  }, []);

  const addImage = useCallback(
    async (file?: File) => {
      await setTool("image");
      setEditorParam(AnnotationEditorParamsType.CREATE, file ? { bitmapFile: file } : {});
    },
    [setTool, setEditorParam],
  );

  const sign = useCallback(
    async (fresh = false) => {
      const parts = partsRef.current;
      if (!parts?.viewer.pdfDocument) {
        return;
      }
      await setTool("signature");
      await parts.editorUi.viewerOptions.signatureManager.loadSignatures();
      if (fresh || parts.editorUi.getState().signatures.length === 0) {
        setEditorParam(AnnotationEditorParamsType.CREATE, {});
      }
    },
    [partsRef, setTool, setEditorParam],
  );

  return {
    tool: handTool ? ("hand" as const) : mark ? ("mark" as const) : editorTool,
    mark,
    editorParams,
    selectedEditor,
    resetTools,
    setTool,
    setMark,
    holdHand,
    endDrawing,
    setEditorParam,
    setEditorDefaults,
    addImage,
    sign,
  };
}
