import { useEffect, useState } from "react";
import type { TabSnapshot } from "../components/DocumentTab";
import type { CommandId } from "../lib/commands";
import { shapeCommands } from "../lib/contextTools";
import { colorFromHex, type MarkupStyle, type ShapeKind } from "../lib/markup";
import { MARKUP_PARAMS_KEY, cleanMarkupParams, defaultMarkupParams, paramsOfMarkup, readMarkupParams, rememberStamp, type MarkupParams, type TextMode } from "../lib/markupParams";
import { usePersistentState } from "../lib/preferences";
import type { PdfViewerApi } from "./usePdfViewer";

const shapesByCommand = new Map(Object.entries(shapeCommands).map(([shape, id]) => [id, shape as ShapeKind]));

function styleChange(patch: Partial<MarkupParams>): Partial<MarkupStyle> {
  return {
    ...(patch.color !== undefined && { color: colorFromHex(patch.color) }),
    ...(patch.fill !== undefined && { fill: patch.fill }),
    ...(patch.width !== undefined && { width: patch.width }),
    ...(patch.opacity !== undefined && { opacity: patch.opacity }),
  };
}

export function useMarkupControls(activeViewer: () => PdfViewerApi | undefined, snapshot: TabSnapshot | undefined) {
  const [stored, setStored] = usePersistentState<MarkupParams>(MARKUP_PARAMS_KEY, defaultMarkupParams);
  const [pickerOpen, setPickerOpen] = useState(false);
  const params = cleanMarkupParams(stored);
  const selection = snapshot?.markupSelection ?? null;
  const shown = selection ? paramsOfMarkup(params, selection) : params;

  useEffect(() => {
    const onStorage = (event: StorageEvent) => event.key === MARKUP_PARAMS_KEY && setStored(readMarkupParams());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setStored]);

  const remember = (patch: Partial<MarkupParams>) => setStored(cleanMarkupParams({ ...readMarkupParams(), ...patch }));

  const change = (patch: Partial<MarkupParams>) => {
    if (selection && activeViewer()?.editorUi?.markup?.restyle(styleChange(patch))) {
      return;
    }
    remember(patch);
  };

  const chooseShape = (shape: ShapeKind) => {
    remember({ shape });
    activeViewer()?.setMarkupTool({ kind: "shape", shape });
  };

  const chooseTextMode = (mode: TextMode) => {
    remember({ textMode: mode });
    const viewer = activeViewer();
    if (mode === "highlight") {
      viewer?.setTool("highlight");
    } else {
      viewer?.setMarkupTool({ kind: "text", text: mode });
    }
  };

  const pickStamp = (id: string) => {
    rememberStamp(id);
    setPickerOpen(false);
    activeViewer()?.setMarkupTool({ kind: "stamp", stamp: id });
  };

  const runMarkupCommand = (id: CommandId) => {
    const shape = shapesByCommand.get(id);
    if (shape) {
      chooseShape(shape);
    } else if (id === "toolStamp") {
      setPickerOpen(true);
    } else if (id === "toolHighlight" || id === "toolUnderline" || id === "toolStrikeout") {
      chooseTextMode(id === "toolHighlight" ? "highlight" : id === "toolUnderline" ? "underline" : "strikeout");
    } else if (id === "underlineSelection" || id === "strikeoutSelection") {
      activeViewer()?.editorUi?.markup?.applyText(id === "underlineSelection" ? "underline" : "strikeout");
    } else {
      return false;
    }
    return true;
  };

  return {
    params: shown,
    change,
    chooseShape,
    chooseTextMode,
    runMarkupCommand,
    picker: { open: pickerOpen, color: params.color, onPick: pickStamp, onClose: () => setPickerOpen(false) },
  };
}

export type MarkupControls = ReturnType<typeof useMarkupControls>;
