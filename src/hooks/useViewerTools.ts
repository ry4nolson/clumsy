import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnnotationEditorParamsType, AnnotationEditorType } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { EditorManagers } from "../lib/editorManagers";
import type { HandTool } from "../lib/handTool";

export type EditorTool = "select" | "hand" | "highlight" | "text" | "draw" | "image" | "signature" | "comment";

export type EditorParams = Record<number, unknown>;

const toolModes: Record<Exclude<EditorTool, "hand">, number> = {
  select: AnnotationEditorType.NONE,
  highlight: AnnotationEditorType.HIGHLIGHT,
  text: AnnotationEditorType.FREETEXT,
  draw: AnnotationEditorType.INK,
  image: AnnotationEditorType.STAMP,
  signature: AnnotationEditorType.SIGNATURE,
  comment: AnnotationEditorType.POPUP,
};

type EditorLayerPage = { annotationEditorLayer?: { annotationEditorLayer?: unknown } | null };

type ToolParts = { eventBus: EventBus; viewer: PDFViewer; hand: HandTool; editorUi: EditorManagers };

export function useViewerTools(partsRef: RefObject<ToolParts | null>) {
  const editorDefaultsRef = useRef<EditorParams>({});
  const handRef = useRef({ tool: false, held: false });
  const selectedRef = useRef(false);
  const layersRef = useRef({ ready: false, waiting: [] as Array<() => void> });
  const [editorTool, setEditorTool] = useState<EditorTool>("select");
  const [handTool, setHandTool] = useState(false);
  const [editorParams, setEditorParams] = useState<EditorParams>({});
  const [selectedEditor, setSelectedEditor] = useState(false);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts) {
      return;
    }
    const { eventBus, hand, viewer } = parts;
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
    };
  }, [partsRef]);

  const resetTools = useCallback(() => {
    handRef.current.tool = false;
    selectedRef.current = false;
    layersRef.current.ready = false;
    partsRef.current?.hand.setActive(handRef.current.held);
    setEditorTool("select");
    setHandTool(false);
    setSelectedEditor(false);
    setEditorParams({});
  }, [partsRef]);

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
      if (!parts?.viewer.pdfDocument) {
        return;
      }
      await setEditorMode(next === "hand" ? AnnotationEditorType.NONE : toolModes[next]);
      handRef.current.tool = next === "hand";
      setHandTool(next === "hand");
      parts.hand.setActive(handRef.current.tool || handRef.current.held);
    },
    [partsRef, setEditorMode],
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

  const setEditorParam = useCallback(
    (type: number, value: unknown) => {
      partsRef.current?.eventBus.dispatch("switchannotationeditorparams", { source: null, type, value });
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
    tool: handTool ? ("hand" as const) : editorTool,
    editorParams,
    selectedEditor,
    resetTools,
    setTool,
    holdHand,
    setEditorParam,
    setEditorDefaults,
    addImage,
    sign,
  };
}
