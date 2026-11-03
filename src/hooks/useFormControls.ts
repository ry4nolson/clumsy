import type { CommandId } from "../lib/commands";
import type { MarkKind } from "../lib/marks";
import { usePersistentState } from "../lib/preferences";
import type { PdfViewerApi } from "./usePdfViewer";

export const markCommands: Record<MarkKind, CommandId> = { check: "markCheck", cross: "markCross", dot: "markDot", date: "markDate" };

const marksByCommand = new Map(Object.entries(markCommands).map(([kind, id]) => [id, kind as MarkKind]));

export function useFormControls(activeViewer: () => PdfViewerApi | undefined) {
  const [fieldHighlights, setFieldHighlights] = usePersistentState("clumsy.fieldHighlights", true);

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
    } else {
      return false;
    }
    return true;
  };

  return { fieldHighlights, runFormCommand };
}
