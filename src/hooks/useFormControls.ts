import { useEffect } from "react";
import type { CommandId } from "../lib/commands";
import { markCommands } from "../lib/contextTools";
import { applyFormScripts } from "../lib/formScripting";
import type { MarkKind } from "../lib/marks";
import { canPrint, showMessage } from "../lib/platform";
import { usePersistentState } from "../lib/preferences";
import { SCRIPT_COMMAND_EVENT, type ScriptRequest } from "../lib/scriptEvents";
import type { PdfViewerApi } from "./usePdfViewer";

const marksByCommand = new Map(Object.entries(markCommands).map(([kind, id]) => [id, kind as MarkKind]));

export function useFormControls(activeViewer: () => PdfViewerApi | undefined, runCommand: (id: CommandId) => void) {
  const [fieldHighlights, setFieldHighlights] = usePersistentState("clumsy.fieldHighlights", true);
  const [formScripts, setFormScripts] = usePersistentState("clumsy.formScripts", true);

  useEffect(() => applyFormScripts(formScripts), [formScripts]);

  useEffect(() => {
    const onScriptCommand = (event: Event) => {
      if (event.target !== activeViewer()?.containerRef.current) {
        return;
      }
      const request = (event as CustomEvent<ScriptRequest>).detail;
      if (request === "print" && !canPrint) {
        void showMessage("Clumsy can't print on this computer yet.", "Clumsy");
      } else {
        runCommand(request === "print" ? "print" : "saveAs");
      }
    };
    window.addEventListener(SCRIPT_COMMAND_EVENT, onScriptCommand);
    return () => window.removeEventListener(SCRIPT_COMMAND_EVENT, onScriptCommand);
  });

  const runFormCommand = (id: CommandId) => {
    const viewer = activeViewer();
    const mark = marksByCommand.get(id);
    if (mark) {
      viewer?.setMark(mark);
    } else if (id === "nextField" || id === "previousField") {
      viewer?.stepField(id === "nextField" ? 1 : -1);
    } else if (id === "resetForm") {
      viewer?.resetForm();
    } else if (id === "toggleFieldHighlights") {
      setFieldHighlights((shown) => !shown);
    } else if (id === "toggleFormScripts") {
      setFormScripts((enabled) => !enabled);
    } else {
      return false;
    }
    return true;
  };

  return { fieldHighlights, formScripts, runFormCommand };
}
