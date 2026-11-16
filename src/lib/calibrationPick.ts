import { lengthOf, snapPoint } from "./measure";

type Viewport = { width: number; height: number; convertToPdfPoint(x: number, y: number): number[] };

type PickPageView = { div?: HTMLDivElement; viewport: Viewport };

export type PickViewer = { getPageView(index: number): unknown };

export type PickedLine = { page: number; line: number[] };

export type CalibrationPick = { result: Promise<PickedLine | null>; cancel: () => void };

const SVG = "http://www.w3.org/2000/svg";
const MIN_SCREEN_LENGTH = 4;
export const PICK_HINT = "Click both ends of a dimension you know. Hold Shift to keep it straight. Esc cancels.";

export function screenLine(start: number[], end: number[], shift: boolean) {
  return [...start, ...(shift ? snapPoint(start, end) : end)];
}

export const longEnough = (line: number[]) => lengthOf(line) >= MIN_SCREEN_LENGTH;

export function pickCalibration(container: HTMLElement, viewer: PickViewer): CalibrationPick {
  let finish: (picked: PickedLine | null) => void = () => {};
  const result = new Promise<PickedLine | null>((resolve) => {
    finish = resolve;
  });
  let anchor: { page: number; point: number[]; pointerId: number; dragged: boolean } | null = null;
  let last: { clientX: number; clientY: number; shiftKey: boolean } | null = null;
  const overlay = document.createElementNS(SVG, "svg");
  overlay.classList.add("calibration-line");
  const line = document.createElementNS(SVG, "line");
  overlay.append(line);
  const hint = document.createElement("div");
  hint.className = "calibration-hint";
  hint.textContent = PICK_HINT;
  container.parentElement?.append(hint);
  container.classList.add("calibrating");

  const viewOf = (page: number) => viewer.getPageView(page) as PickPageView | undefined;

  const pageAt = (target: EventTarget | null) => {
    const div = target instanceof Element ? target.closest<HTMLElement>(".page") : null;
    return div && container.contains(div) ? Number(div.dataset.pageNumber) - 1 : -1;
  };

  const screenPoint = (view: PickPageView, clientX: number, clientY: number) => {
    const box = view.div!.getBoundingClientRect();
    return [((clientX - box.left) * view.viewport.width) / box.width, ((clientY - box.top) * view.viewport.height) / box.height];
  };

  const currentLine = (view: PickPageView, event: { clientX: number; clientY: number; shiftKey: boolean }) =>
    anchor ? screenLine(anchor.point, screenPoint(view, event.clientX, event.clientY), event.shiftKey) : null;

  const draw = () => {
    const view = anchor && viewOf(anchor.page);
    const shown = view?.div && last ? currentLine(view, last) : null;
    if (!view?.div || !shown) {
      overlay.remove();
      return;
    }
    if (overlay.parentNode !== view.div) {
      view.div.append(overlay);
    }
    overlay.setAttribute("viewBox", `0 0 ${view.viewport.width} ${view.viewport.height}`);
    const [x1, y1, x2, y2] = shown;
    Object.entries({ x1, y1, x2, y2 }).forEach(([key, value]) => line.setAttribute(key, String(value)));
  };

  let done = false;
  const close = (picked: PickedLine | null) => {
    if (done) {
      return;
    }
    done = true;
    container.removeEventListener("pointerdown", onPointerDown, true);
    container.removeEventListener("click", onClick, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", onKey, true);
    container.classList.remove("calibrating");
    overlay.remove();
    hint.remove();
    finish(picked);
  };

  const complete = (event: PointerEvent) => {
    const view = anchor && viewOf(anchor.page);
    const shown = view && currentLine(view, event);
    if (!anchor || !view || !shown || !longEnough(shown)) {
      return false;
    }
    const [x1, y1] = view.viewport.convertToPdfPoint(shown[0], shown[1]);
    const [x2, y2] = view.viewport.convertToPdfPoint(shown[2], shown[3]);
    close({ page: anchor.page, line: [x1, y1, x2, y2] });
    return true;
  };

  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerDown = (event: PointerEvent) => {
    const page = pageAt(event.target);
    const view = page >= 0 ? viewOf(page) : undefined;
    if (event.button !== 0 || !view?.div) {
      return;
    }
    swallow(event);
    if (anchor && page === anchor.page) {
      complete(event);
      return;
    }
    anchor = { page, point: screenPoint(view, event.clientX, event.clientY), pointerId: event.pointerId, dragged: false };
    last = event;
    draw();
  };

  const onClick = (event: MouseEvent) => {
    if (pageAt(event.target) >= 0) {
      swallow(event);
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!anchor) {
      return;
    }
    last = event;
    if (event.pointerId === anchor.pointerId && event.buttons & 1) {
      anchor.dragged = true;
    }
    draw();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!anchor || event.pointerId !== anchor.pointerId) {
      return;
    }
    swallow(event);
    if (anchor.dragged) {
      complete(event);
    }
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && event.type === "keydown") {
      swallow(event);
      close(null);
      return;
    }
    if (event.key === "Shift" && last) {
      last = { clientX: last.clientX, clientY: last.clientY, shiftKey: event.type === "keydown" };
      draw();
    }
  };

  container.addEventListener("pointerdown", onPointerDown, true);
  container.addEventListener("click", onClick, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", onKey, true);

  return { result, cancel: () => close(null) };
}
