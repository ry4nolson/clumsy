const ignoredTargets = "a[href], a[href] *, input, textarea, select, option, button, button *, [contenteditable], [contenteditable] *";

export type HandTool = { setActive: (active: boolean) => void; moved: () => boolean; dispose: () => void };

export function attachHandTool(container: HTMLElement): HandTool {
  let active = false;
  let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
  let dragged = false;

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (!active || event.button !== 0 || target?.closest?.(ignoredTargets)) {
      return;
    }
    const box = container.getBoundingClientRect();
    if (event.clientX - box.left >= container.clientWidth || event.clientY - box.top >= container.clientHeight) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: container.scrollLeft, top: container.scrollTop };
    container.setPointerCapture(event.pointerId);
    container.classList.add("grabbing");
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    dragged ||= Math.abs(dx) + Math.abs(dy) > 2;
    container.scrollLeft = drag.left - dx;
    container.scrollTop = drag.top - dy;
  };

  const end = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) {
      return;
    }
    drag = null;
    container.classList.remove("grabbing");
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
  };

  container.addEventListener("pointerdown", onPointerDown, true);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", end);
  container.addEventListener("pointercancel", end);

  return {
    setActive(next) {
      active = next;
      dragged = false;
      container.classList.toggle("hand", next);
      if (!next) {
        drag = null;
        container.classList.remove("grabbing");
      }
    },
    moved: () => dragged,
    dispose() {
      container.removeEventListener("pointerdown", onPointerDown, true);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", end);
      container.removeEventListener("pointercancel", end);
    },
  };
}
