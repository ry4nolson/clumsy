const EDITOR_ID = /^pdfjs_internal_editor_\d+$/;

export const TAP_EDIT = "tapEdit";

export function editorUnder(layer: Element, elements: Element[]) {
  return elements.some((element) => layer.contains(element) && EDITOR_ID.test(element.id));
}

export function attachTapToEdit(container: HTMLElement, signal: AbortSignal) {
  container.addEventListener(
    "click",
    (event) => {
      const page = (event.target as Element | null)?.closest?.(".page");
      const layer = page?.querySelector(".annotationEditorLayer.nonEditing");
      const textLayer = page?.querySelector(".textLayer");
      if ((event as PointerEvent).pointerType !== "touch" || !layer || !textLayer) {
        return;
      }
      layer.classList.add("getElements");
      const found = editorUnder(layer, document.elementsFromPoint(event.clientX, event.clientY));
      layer.classList.remove("getElements");
      if (!found) {
        return;
      }
      container.dataset[TAP_EDIT] = "true";
      const press = { clientX: event.clientX, clientY: event.clientY, pointerType: "mouse", bubbles: false };
      textLayer.dispatchEvent(new PointerEvent("pointerdown", press));
      textLayer.dispatchEvent(new PointerEvent("pointerdown", press));
    },
    { signal },
  );
}

export function pressDelete(container: HTMLElement) {
  const focused = document.activeElement;
  const target = focused && container.contains(focused) ? focused : container;
  if (target === container) {
    container.focus({ preventScroll: true });
  }
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace", bubbles: true, cancelable: true }));
}
