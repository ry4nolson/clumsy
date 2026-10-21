const caretTypes = new Set(["text", "search", "url", "tel", "password"]);

export function moveCaretToEdge(target: Element | null, toStart: boolean) {
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && caretTypes.has(target.type))) {
    const position = toStart ? 0 : target.value.length;
    target.setSelectionRange(position, position);
    return;
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    window.getSelection()?.modify("move", toStart ? "backward" : "forward", "documentboundary");
  }
}
