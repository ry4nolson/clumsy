import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnnotationEditorParamsType, AnnotationEditorType } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { HandTool } from "../lib/handTool";

export type EditorTool = "select" | "hand" | "highlight" | "text" | "draw" | "image";

export type EditorParams = Record<number, unknown>;

const toolModes: Record<Exclude<EditorTool, "hand">, number> = {
  select: AnnotationEditorType.NONE,
  highlight: AnnotationEditorType.HIGHLIGHT,
  text: AnnotationEditorType.FREETEXT,
  draw: AnnotationEditorType.INK,
  image: AnnotationEditorType.STAMP,
};

type ToolParts = { eventBus: EventBus; viewer: PDFViewer; hand: HandTool };

export function useViewerTools(partsRef: RefObject<ToolParts | null>) {
  const editorDefaultsRef = useRef<EditorParams>({});
  const handRef = useRef({ tool: false, held: false });
  const selectedRef = useRef(false);
  const [editorTool, setEditorTool] = useState<EditorTool>("select");
  const [handTool, setHandTool] = useState(false);
  const [editorParams, setEditorParams] = useState<EditorParams>({});
  const [selectedEditor, setSelectedEditor] = useState(false);

  useEffect(() => {
    const parts = partsRef.current;
    if (!parts) {
      return;
    }
    const { eventBus, hand } = parts;
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
    eventBus.on("editingstateschanged", onStates);
    eventBus.on("annotationeditorparamschanged", onParams);
    eventBus.on("annotationeditormodechanged", onMode);
    return () => {
      eventBus.off("editingstateschanged", onStates);
      eventBus.off("annotationeditorparamschanged", onParams);
      eventBus.off("annotationeditormodechanged", onMode);
    };
  }, [partsRef]);

  const resetTools = useCallback(() => {
    handRef.current.tool = false;
    selectedRef.current = false;
    partsRef.current?.hand.setActive(handRef.current.held);
    setEditorTool("select");
    setHandTool(false);
    setSelectedEditor(false);
    setEditorParams({});
  }, [partsRef]);

  const setEditorMode = useCallback(
    (mode: number) => {
      const parts = partsRef.current;
      if (!parts?.viewer.pdfDocument || (parts.viewer.annotationEditorMode as unknown as number) === mode) {
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
    },
    [partsRef],
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
  };
}
