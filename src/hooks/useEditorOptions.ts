import { AnnotationEditorParamsType } from "pdfjs-dist";
import { usePersistentState } from "../lib/preferences";
import { highlightColors, type EditorParams, type EditorTool, type PdfViewerApi } from "./usePdfViewer";

const Params = AnnotationEditorParamsType;

export const inkColors = ["#000000", "#d32f2f", "#1565c0", "#2e7d32"];

export const colorParams: Partial<Record<EditorTool, number>> = {
  highlight: Params.HIGHLIGHT_COLOR,
  text: Params.FREETEXT_COLOR,
  draw: Params.INK_COLOR,
};

export type EditorOption = { type: number; label: string; min: number; max: number; step: number; format: (value: number) => string };

export const toolOptions: Partial<Record<EditorTool, EditorOption[]>> = {
  highlight: [{ type: Params.HIGHLIGHT_THICKNESS, label: "Freehand thickness", min: 8, max: 24, step: 1, format: (value) => `${value}` }],
  text: [{ type: Params.FREETEXT_SIZE, label: "Font size", min: 5, max: 100, step: 1, format: (value) => `${value} pt` }],
  draw: [
    { type: Params.INK_THICKNESS, label: "Thickness", min: 1, max: 20, step: 1, format: (value) => `${value}` },
    { type: Params.INK_OPACITY, label: "Opacity", min: 0.05, max: 1, step: 0.05, format: (value) => `${Math.round(value * 100)}%` },
  ],
};

const initialParams: EditorParams = {
  [Params.HIGHLIGHT_COLOR]: Object.values(highlightColors)[0],
  [Params.FREETEXT_COLOR]: inkColors[0],
  [Params.INK_COLOR]: inkColors[0],
  [Params.HIGHLIGHT_THICKNESS]: 12,
  [Params.FREETEXT_SIZE]: 10,
  [Params.INK_THICKNESS]: 1,
  [Params.INK_OPACITY]: 1,
};

type EditorState = { editorParams: EditorParams; selectedEditor: boolean } | undefined;

export function useEditorOptions(activeViewer: () => PdfViewerApi | undefined, snapshot: EditorState) {
  const [stored, setStored] = usePersistentState<EditorParams>("clumsy.editorParams", initialParams);
  const remembered = { ...initialParams, ...stored };
  const shown = snapshot?.selectedEditor ? { ...remembered, ...snapshot.editorParams } : remembered;

  const change = (type: number, value: unknown) => {
    activeViewer()?.setEditorParam(type, value);
    if (!snapshot?.selectedEditor) {
      setStored((current) => ({ ...initialParams, ...current, [type]: value }));
    }
  };

  return { remembered, shown, change };
}
