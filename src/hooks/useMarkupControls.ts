import { useEffect, useRef, useState } from "react";
import type { TabSnapshot } from "../components/DocumentTab";
import type { CommandId } from "../lib/commands";
import { measureCommands, shapeCommands } from "../lib/contextTools";
import { colorFromHex, type MarkupStyle, type ShapeKind } from "../lib/markup";
import { SET_SCALE_EVENT, type MeasureKind } from "../lib/measure";
import { MARKUP_PARAMS_KEY, cleanMarkupParams, defaultMarkupParams, paramsOfMarkup, readMarkupParams, rememberStamp, type MarkupParams, type TextMode } from "../lib/markupParams";
import { usePersistentState } from "../lib/preferences";
import { useMeasurementExport } from "./useMeasurementExport";
import type { PdfViewerApi } from "./usePdfViewer";

const shapesByCommand = new Map(Object.entries(shapeCommands).map(([shape, id]) => [id, shape as ShapeKind]));
const measuresByCommand = new Map(Object.entries(measureCommands).map(([measure, id]) => [id, measure as MeasureKind]));

function styleChange(patch: Partial<MarkupParams>): Partial<MarkupStyle> {
  return {
    ...(patch.color !== undefined && { color: colorFromHex(patch.color) }),
    ...(patch.fill !== undefined && { fill: patch.fill }),
    ...(patch.width !== undefined && { width: patch.width }),
    ...(patch.opacity !== undefined && { opacity: patch.opacity }),
  };
}

type MarkupHost = { runCommand: (id: CommandId, options?: { pages?: number[] }) => void; showMeasurements: () => void; documentName: () => string };

export function useMarkupControls(activeViewer: () => PdfViewerApi | undefined, snapshot: TabSnapshot | undefined, host: MarkupHost) {
  const [stored, setStored] = usePersistentState<MarkupParams>(MARKUP_PARAMS_KEY, defaultMarkupParams);
  const [pickerOpen, setPickerOpen] = useState(false);
  const params = cleanMarkupParams(stored);
  const selection = snapshot?.markupSelection ?? null;
  const shown = selection ? paramsOfMarkup(params, selection) : params;
  const { runMeasurementCommand } = useMeasurementExport(activeViewer, host.documentName);
  const latest = useRef({ activeViewer, host });
  latest.current = { activeViewer, host };

  useEffect(() => {
    const onStorage = (event: StorageEvent) => event.key === MARKUP_PARAMS_KEY && setStored(readMarkupParams());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [setStored]);

  useEffect(() => {
    const onSetScale = (event: Event) => {
      if (event.target === latest.current.activeViewer()?.containerRef.current) {
        latest.current.host.runCommand("setScale", { pages: (event as CustomEvent<{ pages: number[] }>).detail.pages });
      }
    };
    window.addEventListener(SET_SCALE_EVENT, onSetScale);
    return () => window.removeEventListener(SET_SCALE_EVENT, onSetScale);
  }, []);

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

  const chooseMeasure = (measure: MeasureKind) => {
    remember({ measure });
    host.showMeasurements();
    activeViewer()?.setMarkupTool({ kind: "measure", measure });
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
    const measure = measuresByCommand.get(id);
    if (shape) {
      chooseShape(shape);
    } else if (measure) {
      chooseMeasure(measure);
    } else if (id === "toolStamp") {
      setPickerOpen(true);
    } else if (id === "toolHighlight" || id === "toolUnderline" || id === "toolStrikeout") {
      chooseTextMode(id === "toolHighlight" ? "highlight" : id === "toolUnderline" ? "underline" : "strikeout");
    } else if (id === "underlineSelection" || id === "strikeoutSelection") {
      activeViewer()?.editorUi?.markup?.applyText(id === "underlineSelection" ? "underline" : "strikeout");
    } else {
      return runMeasurementCommand(id);
    }
    return true;
  };

  return {
    params: shown,
    change,
    chooseShape,
    chooseMeasure,
    chooseTextMode,
    runMarkupCommand,
    picker: { open: pickerOpen, color: params.color, onPick: pickStamp, onClose: () => setPickerOpen(false) },
  };
}

export type MarkupControls = ReturnType<typeof useMarkupControls>;
