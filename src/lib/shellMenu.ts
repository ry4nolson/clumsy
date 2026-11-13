export const nativeMenuTargets = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .commentPopup';

export type MenuChoice = "webview" | "copy" | "none";

export const menuChoice = (inEditable: boolean, selectedText: string): MenuChoice => (inEditable ? "webview" : selectedText.trim() ? "copy" : "none");

function copySelection(text: string) {
  if (!document.execCommand("copy")) {
    void navigator.clipboard.writeText(text).catch(() => undefined);
  }
}

export function blockWebviewMenu(offerCopy: (copy: () => void) => void) {
  window.addEventListener("contextmenu", (event) => {
    if (event.defaultPrevented) {
      return;
    }
    const inEditable = event.target instanceof Element && !!event.target.closest(nativeMenuTargets);
    const text = window.getSelection()?.toString() ?? "";
    const choice = menuChoice(inEditable, text);
    if (choice !== "webview") {
      event.preventDefault();
    }
    if (choice === "copy") {
      offerCopy(() => copySelection(text));
    }
  });
}
