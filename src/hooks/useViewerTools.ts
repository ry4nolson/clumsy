import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnnotationEditorParamsType, AnnotationEditorType } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { EditorManagers } from "../lib/editorManagers";
import type { HandTool } from "../lib/handTool";
import { pickCalibration } from "../lib/calibrationPick";
import { attachMarkPlacement, type MarkPlacement } from "../lib/markPlacement";
import type { MarkupTool } from "../lib/markupLayer";
import type { MarkKind } from "../lib/marks";

export type EditorTool = "select" | "hand" | "highlight" | "text" | "draw" | "image" | "signature" | "comment" | "mark" | "shape" | "stamp" | "underline" | "strikeout" | "measure";

type PdfTool = Exclude<EditorTool, "hand" | "mark" | "shape" | "stamp" | "underline" | "strikeout" | "measure">;

const markupToolName = (tool: NonNullable<MarkupTool>): EditorTool => (tool.kind === "text" ? tool.text : tool.kind);

export type EditorParams = Record<number, unknown>;

const toolModes: Record<PdfTool, number> = {
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

const pushParams = (eventBus: EventBus, params: EditorParams) => {
  for (const [type, value] of Object.entries(params)) {
    eventBus.dispatch("switchannotationeditorparams", { source: null, type: Number(type), value });
  }
};

const unselectEditors = (viewer: PDFViewer) => (viewer as unknown as DrawingHost)._layerProperties?.annotationEditorUIManager?.unselectAll?.();

export function finishDrawing(viewer: PDFViewer) {
  let finished = false;
  for (let index = 0; index < viewer.pagesCount; index++) {
    const layer = (viewer.getPageView(index) as DrawingLayerPage | undefined)?.annotationEditorLayer?.annotationEditorLayer;
    finished = !!layer?.commitOrRemove?.() || finished;
  }
  if (finished) {
    unselectEditors(viewer);
  }
}

export function useViewerTools(partsRef: RefObject<ToolParts | null>) {
  const editorDefaultsRef = useRef<EditorParams>({});
  const handRef = useRef({ tool: false, held: false });
  const selectedRef = useRef(false);
  const layersRef = useRef({ ready: false, waiting: [] as Array<() => void> });
  const markRef = useRef<{ kind: MarkKind | null; placement: MarkPlacement | null }>({ kind: null, placement: null });
  const markupToolRef = useRef<MarkupTool>(null);
  const presetRef = useRef<{ id: string; mode: number } | null>(null);
  const [editorPreset, setEditorPreset] = useState<string | null>(null);
  const [markupTool, setMarkupToolState] = useState<MarkupTool>(null);
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
    parts.editorUi.markup?.setInteractive(true);
    const placement = attachMarkPlacement(viewer.container, viewer);
    markRef.current.placement = placement;
    const onPointerDown = ({ target, isPrimary, button }: PointerEvent) => {
      const ink = (viewer.annotationEditorMode as unknown as number) === AnnotationEditorType.INK;
      if (ink && isPrimary && button === 0 && target instanceof HTMLElement && target.classList.contains("annotationEditorLayer")) {
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
      if (presetRef.current && presetRef.current.mode !== mode) {
        presetRef.current = null;
        setEditorPreset(null);
        if (mode === AnnotationEditorType.NONE && !selectedRef.current) {
          pushParams(eventBus, editorDefaultsRef.current);
        }
      }
      setEditorTool(match ?? "select");
      if (mode !== AnnotationEditorType.NONE && markupToolRef.current) {
        markupToolRef.current = null;
        setMarkupToolState(null);
        parts.editorUi.markup?.setTool(null);
      }
      parts.editorUi.markup?.setInteractive(mode === AnnotationEditorType.NONE && !handRef.current.tool);
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
      if (!selectedRef.current) {
        pushParams(eventBus, editorDefaultsRef.current);
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

  const showMarkupTool = useCallback(
    (tool: MarkupTool) => {
      markupToolRef.current = tool;
      setMarkupToolState(tool);
      partsRef.current?.editorUi.markup?.setTool(tool);
    },
    [partsRef],
  );

  const dropPreset = useCallback(() => {
    const had = presetRef.current !== null;
    presetRef.current = null;
    setEditorPreset(null);
    return had;
  }, []);

  const resetTools = useCallback(() => {
    dropPreset();
    handRef.current.tool = false;
    showMarkupTool(null);
    selectedRef.current = false;
    layersRef.current.ready = false;
    showMark(null);
    partsRef.current?.hand.setActive(handRef.current.held);
    setEditorTool("select");
    setHandTool(false);
    setSelectedEditor(false);
    setEditorParams({});
  }, [partsRef, showMark, showMarkupTool, dropPreset]);

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
        try {
          parts.viewer.annotationEditorMode = { mode };
        } catch (error) {
          parts.eventBus.off("annotationeditormodechanged", done);
          if (mode !== AnnotationEditorType.NONE) {
            throw error;
          }
          resolve();
        }
      });
    },
    [partsRef, editorLayerReady],
  );

  const setTool = useCallback(
    async (next: EditorTool) => {
      const parts = partsRef.current;
      if (!parts?.viewer.pdfDocument || !(next === "hand" || next in toolModes)) {
        return;
      }
      const hadPreset = dropPreset();
      showMark(null);
      showMarkupTool(null);
      const mode = next === "hand" ? AnnotationEditorType.NONE : toolModes[next as PdfTool];
      await setEditorMode(mode);
      handRef.current.tool = next === "hand";
      setHandTool(next === "hand");
      parts.hand.setActive(handRef.current.tool || handRef.current.held);
      parts.editorUi.markup?.setInteractive(next === "select");
      if (hadPreset && mode !== AnnotationEditorType.NONE) {
        unselectEditors(parts.viewer);
      }
      if (hadPreset && !selectedRef.current) {
        pushParams(parts.eventBus, editorDefaultsRef.current);
      }
    },
    [partsRef, setEditorMode, showMark, showMarkupTool, dropPreset],
  );

  const armEditorPreset = useCallback(
    async (next: "highlight" | "draw" | "text", params: EditorParams, id: string) => {
      await setTool(next);
      const parts = partsRef.current;
      const mode = toolModes[next];
      if (!parts || (parts.viewer.annotationEditorMode as unknown as number) !== mode) {
        return;
      }
      finishDrawing(parts.viewer);
      unselectEditors(parts.viewer);
      pushParams(parts.eventBus, params);
      presetRef.current = { id, mode };
      setEditorPreset(id);
    },
    [partsRef, setTool],
  );

  const setMarkupTool = useCallback(
    async (tool: NonNullable<MarkupTool>) => {
      const parts = partsRef.current;
      if (!parts?.viewer.pdfDocument) {
        return;
      }
      const hadPreset = dropPreset();
      showMark(null);
      await setEditorMode(AnnotationEditorType.NONE);
      if (hadPreset && !selectedRef.current) {
        pushParams(parts.eventBus, editorDefaultsRef.current);
      }
      handRef.current.tool = false;
      setHandTool(false);
      parts.hand.setActive(handRef.current.held);
      showMarkupTool(tool);
    },
    [partsRef, setEditorMode, showMark, showMarkupTool, dropPreset],
  );

  const setMark = useCallback(
    async (kind: MarkKind) => {
      const parts = partsRef.current;
      if (!parts?.viewer.pdfDocument) {
        return;
      }
      const hadPreset = dropPreset();
      showMark(kind);
      showMarkupTool(null);
      markRef.current.placement?.setMark(null);
      await setEditorMode(markMode(kind));
      if (hadPreset && !selectedRef.current) {
        pushParams(parts.eventBus, editorDefaultsRef.current);
      }
      if (markRef.current.kind !== kind) {
        return;
      }
      markRef.current.placement?.setMark(kind);
      handRef.current.tool = false;
      setHandTool(false);
      parts.hand.setActive(handRef.current.held);
    },
    [partsRef, setEditorMode, showMark, showMarkupTool, dropPreset],
  );

  const holdHand = useCallback(
    (held: boolean) => {
      const parts = partsRef.current;
      if (handRef.current.held === held) {
        return false;
      }
      if (!parts?.viewer.pdfDocument) {
        handRef.current.held = false;
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

  const pickLine = useCallback(() => {
    const parts = partsRef.current;
    return parts?.viewer.pdfDocument ? pickCalibration(parts.viewer.container, parts.viewer) : null;
  }, [partsRef]);

  return {
    tool: handTool ? ("hand" as const) : mark ? ("mark" as const) : markupTool ? markupToolName(markupTool) : editorTool,
    mark,
    markupTool,
    armedTool: markupTool?.preset?.id ?? editorPreset,
    setMarkupTool,
    armEditorPreset,
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
    pickLine,
  };
}
