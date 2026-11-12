import { dateLabel, markShape, type MarkKind } from "./marks";

type PlacedEditor = { editorDiv?: HTMLElement; commitOrRemove?: () => void };

type EditorLayer = {
  div: HTMLElement;
  createAndAddNewEditor(event: { offsetX: number; offsetY: number }, isCentered: boolean, data?: object): PlacedEditor | null;
};

type LayerPage = { annotationEditorLayer?: { annotationEditorLayer?: EditorLayer | null } | null };

export type MarkViewer = { getPageView(index: number): unknown };

export type MarkPlacement = { setMark: (kind: MarkKind | null) => void; dispose: () => void };

const CLICK_SLOP = 4;

export function attachMarkPlacement(container: HTMLElement, viewer: MarkViewer): MarkPlacement {
  let mark: MarkKind | null = null;
  let down: { id: number; x: number; y: number } | null = null;

  const layerAt = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement) || !target.classList.contains("annotationEditorLayer")) {
      return null;
    }
    const index = Number(target.closest<HTMLElement>(".page")?.dataset.pageNumber) - 1;
    const layer = (viewer.getPageView(index) as LayerPage | undefined)?.annotationEditorLayer?.annotationEditorLayer;
    return layer?.div === target ? layer : null;
  };

  const place = (layer: EditorLayer, event: PointerEvent, kind: MarkKind) => {
    if (kind !== "date") {
      const { lines, description, heightInPage } = markShape(kind);
      layer.createAndAddNewEditor(event, true, {
        signatureData: { lines, mustSmooth: false, areContours: true, description, uuid: null, heightInPage },
      });
      return;
    }
    const editor = layer.createAndAddNewEditor(event, false);
    if (editor?.editorDiv && document.activeElement === editor.editorDiv) {
      document.execCommand("insertText", false, dateLabel(new Date()));
      editor.commitOrRemove?.();
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    down = null;
    if (!mark || event.defaultPrevented || event.button !== 0 || !layerAt(event.target)) {
      return;
    }
    event.stopPropagation();
    down = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!down || event.pointerId !== down.id) {
      return;
    }
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_SLOP;
    down = null;
    if (!(event.target instanceof Node) || !container.contains(event.target)) {
      return;
    }
    event.stopPropagation();
    const layer = layerAt(event.target);
    if (mark && layer && !moved) {
      place(layer, event, mark);
    }
  };

  const onPointerCancel = () => {
    down = null;
  };

  container.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerCancel, true);

  return {
    setMark(kind) {
      mark = kind;
      down = null;
      container.classList.toggle("placing-mark", !!kind);
    },
    dispose() {
      container.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      container.classList.remove("placing-mark");
    },
  };
}
