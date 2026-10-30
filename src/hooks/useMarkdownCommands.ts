import { useCallback } from "react";
import { hasCaret } from "../lib/caret";
import type { CommandId } from "../lib/commands";
import { openLinkedFile, readDocumentFromPath, showError } from "../lib/platform";
import * as ws from "../lib/workspace";
import type { WorkspaceApi } from "./useWorkspace";

export function useMarkdownCommands({ workspaceRef, activeMarkdown, openSource }: WorkspaceApi) {
  const runMarkdownCommand = useCallback(
    (id: CommandId, fromMenu: boolean) => {
      const handle = activeMarkdown();
      if (ws.focusedTab(workspaceRef.current).kind !== "markdown" || !handle) {
        return false;
      }
      const toEdge = (top: boolean) => {
        if (!(fromMenu && hasCaret(document.activeElement) && !document.activeElement?.closest(".cm-editor"))) {
          handle.toEdge(top);
          return true;
        }
        return false;
      };
      const actions: Partial<Record<CommandId, () => boolean | void>> = {
        find: () => handle.openFind(),
        findNext: () => handle.findAgain(false),
        findPrevious: () => handle.findAgain(true),
        useSelectionForFind: () => {
          const selection = window.getSelection()?.toString().trim();
          if (selection) {
            handle.openFind(selection);
          }
        },
        toggleMarkdownSource: () => handle.toggleSource(),
        actualSize: () => handle.zoom(0),
        zoomIn: () => handle.zoom(1),
        zoomOut: () => handle.zoom(-1),
        firstPage: () => toEdge(true),
        lastPage: () => toEdge(false),
      };
      const action = actions[id];
      return action ? action() !== false : false;
    },
    [activeMarkdown, workspaceRef],
  );

  const editingCommand = useCallback((name: "undo" | "redo") => !!activeMarkdown()?.editingCommand(name), [activeMarkdown]);

  const openLinked = useCallback(
    async (document: string, href: string) => {
      try {
        await openSource(readDocumentFromPath(await openLinkedFile(document, href)));
      } catch (error) {
        await showError(`Could not open ${href}.\n\n${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [openSource],
  );

  return { runMarkdownCommand, editingCommand, openLinked };
}
