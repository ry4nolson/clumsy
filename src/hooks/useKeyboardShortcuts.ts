import { useEffect, useRef } from "react";
import { hasCaret } from "../lib/caret";
import { isTypingTarget, resolveCommand, type CommandId } from "../lib/commands";

function cancelOpenDialog(target: EventTarget | null) {
  const open = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  const dialog = (target instanceof Element && target.closest<HTMLDialogElement>("dialog[open]")) || open[open.length - 1];
  if (!dialog) {
    return false;
  }
  if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) {
    dialog.close();
  }
  return true;
}

export function useKeyboardShortcuts(isMac: boolean, onCommand: (id: CommandId) => void, onEscape: (typing: boolean) => void) {
  const handlers = useRef({ onCommand, onEscape });
  handlers.current = { onCommand, onEscape };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      const typing = isTypingTarget(event.target);
      const id = resolveCommand(event, isMac, typing, event.target instanceof Element && hasCaret(event.target));
      if (!id || id === "undo" || id === "redo") {
        return;
      }
      if (id === "escape") {
        if (cancelOpenDialog(event.target)) {
          event.preventDefault();
        } else {
          handlers.current.onEscape(typing);
        }
        return;
      }
      event.preventDefault();
      handlers.current.onCommand(id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMac]);
}
