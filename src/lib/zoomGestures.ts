export type ZoomBy = (scaleFactor: number, origin: [number, number]) => void;

type Point = { clientX: number; clientY: number };

const PINCH_THRESHOLD = 0.01;

export function wheelFactor(deltaY: number) {
  return Math.exp(-deltaY / 100);
}

export function pinchSpan(first: Point, second: Point) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

export function pinchCenter(first: Point, second: Point): [number, number] {
  return [(first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2];
}

export function pinchFactor(previous: number, current: number) {
  if (previous <= 0 || current <= 0) {
    return null;
  }
  const factor = current / previous;
  return Math.abs(factor - 1) < PINCH_THRESHOLD ? null : factor;
}

const STEP_RATIO = 1.2;

export function pinchSteps(scale: number) {
  if (scale >= STEP_RATIO) {
    return 1;
  }
  return scale <= 1 / STEP_RATIO ? -1 : 0;
}

function attachPinch(target: EventTarget, accepts: (target: EventTarget | null) => boolean, zoomBy: ZoomBy, signal: AbortSignal) {
  const options = { passive: false, signal };
  let span = 0;
  const onStart = (event: TouchEvent) => {
    span = event.touches.length === 2 && accepts(event.target) ? pinchSpan(event.touches[0], event.touches[1]) : 0;
    if (span) {
      event.preventDefault();
    }
  };
  const onMove = (event: TouchEvent) => {
    if (!span || event.touches.length !== 2) {
      return;
    }
    event.preventDefault();
    const current = pinchSpan(event.touches[0], event.touches[1]);
    const factor = pinchFactor(span, current);
    if (factor) {
      span = current;
      zoomBy(factor, pinchCenter(event.touches[0], event.touches[1]));
    }
  };
  const end = () => {
    span = 0;
  };
  target.addEventListener("touchstart", onStart as EventListener, options);
  target.addEventListener("touchmove", onMove as EventListener, options);
  target.addEventListener("touchend", end, options);
  target.addEventListener("touchcancel", end, options);
}

export function attachZoomGestures(container: HTMLElement, zoomBy: ZoomBy) {
  const listening = new AbortController();
  container.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      zoomBy(wheelFactor(event.deltaY), [event.clientX, event.clientY]);
    },
    { passive: false, signal: listening.signal },
  );
  attachPinch(container, () => true, zoomBy, listening.signal);
  return () => listening.abort();
}

export function attachSteppedPinch(root: Document, selector: string, step: (direction: 1 | -1) => void) {
  const listening = new AbortController();
  let scale = 1;
  attachPinch(
    root,
    (target) => {
      scale = 1;
      return target instanceof Element && !!target.closest(selector);
    },
    (factor) => {
      scale *= factor;
      const direction = pinchSteps(scale);
      if (direction) {
        scale = 1;
        step(direction);
      }
    },
    listening.signal,
  );
  return () => listening.abort();
}
