import { useMemo } from "react";
import type { CommandId } from "../lib/commands";
import { usePersistentState } from "../lib/preferences";
import { defaultViewModes, isScrollMode, isSpreadMode, scrollsVertically, type ScrollModeName, type SpreadModeName, type ViewModes } from "../lib/viewModes";
import type { PdfViewerApi } from "./usePdfViewer";
import { useViewerInput } from "./useViewerInput";

const scrollCommands: Partial<Record<CommandId, ScrollModeName>> = {
  scrollVertical: "vertical",
  scrollHorizontal: "horizontal",
  scrollWrapped: "wrapped",
  scrollPage: "page",
};

const spreadCommands: Partial<Record<CommandId, SpreadModeName>> = { spreadNone: "none", spreadOdd: "odd", spreadEven: "even" };

export function useViewControls(activeViewer: () => PdfViewerApi | undefined) {
  const [scrollMode, setScrollMode] = usePersistentState<ScrollModeName>("clumsy.scrollMode", defaultViewModes.scrollMode);
  const [spreadMode, setSpreadMode] = usePersistentState<SpreadModeName>("clumsy.spreadMode", defaultViewModes.spreadMode);
  const [caretBrowsing, setCaretBrowsing] = usePersistentState("clumsy.caretBrowsing", false);
  useViewerInput(activeViewer);

  const defaultModes = useMemo<ViewModes>(
    () => ({
      scrollMode: isScrollMode(scrollMode) ? scrollMode : defaultViewModes.scrollMode,
      spreadMode: isSpreadMode(spreadMode) ? spreadMode : defaultViewModes.spreadMode,
    }),
    [scrollMode, spreadMode],
  );

  const runViewCommand = (id: CommandId) => {
    const scroll = scrollCommands[id];
    const spread = spreadCommands[id];
    const viewer = activeViewer();
    if (scroll) {
      viewer?.setScrollMode(scroll);
      setScrollMode(scroll);
    } else if (spread) {
      viewer?.setSpreadMode(spread);
      setSpreadMode(spread);
    } else if (id === "goBack" || id === "goForward") {
      viewer?.navigate(id === "goBack" ? "back" : "forward");
    } else if (id === "toolHand") {
      viewer?.setTool("hand");
    } else if (id === "toggleCaretBrowsing") {
      setCaretBrowsing((enabled) => !enabled);
    } else {
      return false;
    }
    return true;
  };

  const menuState = (active: Partial<ViewModes> | undefined) => ({
    caretBrowsing,
    scrollMode: active?.scrollMode ?? defaultModes.scrollMode,
    spreadMode: active?.spreadMode ?? defaultModes.spreadMode,
    documentMapAvailable: !active?.scrollMode || scrollsVertically(active.scrollMode),
  });

  return { defaultModes, caretBrowsing, runViewCommand, menuState };
}
