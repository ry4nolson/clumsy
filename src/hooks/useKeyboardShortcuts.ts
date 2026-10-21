import { useEffect, useRef } from "react";
import { isTypingTarget, resolveCommand, type CommandId } from "../lib/commands";

export function useKeyboardShortcuts(isMac: boolean, onCommand: (id: CommandId) => void, onEscape: (typing: boolean) => void) {
  const handlers = useRef({ onCommand, onEscape });
  handlers.current = { onCommand, onEscape };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      const id = resolveCommand(event, isMac, typing);
      if (!id || id === "undo" || id === "redo") {
        return;
      }
      if (id === "escape") {
        handlers.current.onEscape(typing);
        return;
      }
      event.preventDefault();
      handlers.current.onCommand(id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMac]);
}
