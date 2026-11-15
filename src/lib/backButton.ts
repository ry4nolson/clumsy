import { closeDrawer } from "./drawer";
import { attachSteppedPinch } from "./zoomGestures";

type BackScope = Pick<Document, "querySelector">;

type BackGlobals = { clumsyBack?: () => boolean };

export function backTarget(scope: BackScope): { kind: "popover" | "escape"; element: Element } | null {
  const popover = scope.querySelector(":popover-open");
  if (popover) {
    return { kind: "popover", element: popover };
  }
  const closable = scope.querySelector("dialog[open]") ?? scope.querySelector(".findbar:not([inert] *)");
  return closable ? { kind: "escape", element: closable } : null;
}

export function goBack(scope: Document = document) {
  const target = backTarget(scope);
  if (!target) {
    return closeDrawer(scope);
  }
  if (target.kind === "popover") {
    (target.element as HTMLElement).hidePopover();
  } else {
    target.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  }
  return true;
}

const zoomKeys = { 1: { key: "=", code: "Equal" }, [-1]: { key: "-", code: "Minus" } };

export function installTouchShell(target: BackGlobals = window as BackGlobals) {
  target.clumsyBack = () => goBack();
  attachSteppedPinch(document, ".markdown-tab", (direction) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { ...zoomKeys[direction], ctrlKey: true, bubbles: true, cancelable: true }));
  });
}
