import { AnnotationEditorParamsType } from "pdfjs-dist";
import type { TabSnapshot } from "../components/DocumentTab";
import type { ToolsProps } from "../components/ToolsGroup";
import type { CommandId } from "../lib/commands";
import { markCommands, toolCommand } from "../lib/contextTools";
import { colorParams, type useEditorOptions } from "./useEditorOptions";
import type { PdfViewerApi } from "./usePdfViewer";

export function useToolbarTools(
  activeViewer: () => PdfViewerApi | undefined,
  snapshot: TabSnapshot | undefined,
  editorOptions: ReturnType<typeof useEditorOptions>,
  runCommand: (id: CommandId) => void,
): ToolsProps {
  const tool = snapshot?.tool ?? "select";
  const colorParam = colorParams[tool];
  const highlightsShown = snapshot?.editorParams[AnnotationEditorParamsType.HIGHLIGHT_SHOW_ALL] !== false;
  return {
    tool,
    mark: snapshot?.mark ?? null,
    toolColor: colorParam === undefined ? "" : String(editorOptions.shown[colorParam] ?? ""),
    editorParams: editorOptions.shown,
    highlightsShown,
    signatures: snapshot?.signatures ?? [],
    onTool: (next) => runCommand(toolCommand(next)),
    onEndDrawing: () => activeViewer()?.endDrawing(),
    onToolColor: (color) => colorParam !== undefined && editorOptions.change(colorParam, color),
    onEditorParam: editorOptions.change,
    onToggleHighlights: () => activeViewer()?.setEditorParam(AnnotationEditorParamsType.HIGHLIGHT_SHOW_ALL, !highlightsShown),
    onImage: () => runCommand("addImage"),
    onSign: () => runCommand("sign"),
    onMark: (kind) => runCommand(markCommands[kind]),
    onNewSignature: () => runCommand("newSignature"),
    onPlaceSignature: (uuid) => activeViewer()?.editorUi?.placeSignature(uuid),
    onForgetSignature: (uuid) => activeViewer()?.editorUi?.forgetSignature(uuid),
  };
}
