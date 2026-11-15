export type ZoomBy = (scaleFactor: number, origin: [number, number]) => void;

type PanBy = (left: number, top: number) => void;

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

export function panBetween(previous: [number, number], current: [number, number]): [number, number] {
  return [previous[0] - current[0], previous[1] - current[1]];
}

function attachPinch(target: EventTarget, accepts: (target: EventTarget | null) => boolean, zoomBy: ZoomBy, signal: AbortSignal, panBy?: PanBy) {
  const options = { passive: false, capture: true, signal };
  const fingers = new Map<number, Point>();
  let span = 0;
  let center: [number, number] = [0, 0];
  let touchDriven = false;

  const begin = (first: Point, second: Point, origin: EventTarget | null) => {
    span = accepts(origin) ? pinchSpan(first, second) : 0;
    center = pinchCenter(first, second);
  };
  const follow = (first: Point, second: Point, pans: boolean) => {
    const next = pinchCenter(first, second);
    if (pans) {
      panBy?.(...panBetween(center, next));
    }
    center = next;
    const current = pinchSpan(first, second);
    const factor = pinchFactor(span, current);
    if (factor) {
      span = current;
      zoomBy(factor, next);
    }
  };

  const onTouchStart = (event: TouchEvent) => {
    touchDriven = true;
    span = 0;
    if (event.touches.length === 2) {
      begin(event.touches[0], event.touches[1], event.target);
    }
    if (span) {
      event.preventDefault();
    }
  };
  const onTouchMove = (event: TouchEvent) => {
    if (!span || event.touches.length !== 2) {
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    follow(event.touches[0], event.touches[1], event.cancelable);
  };
  const onTouchEnd = (event: TouchEvent) => {
    span = 0;
    touchDriven = event.touches.length > 0;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch") {
      return;
    }
    fingers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (fingers.size === 2 && !touchDriven) {
      const [first, second] = fingers.values();
      begin(first, second, event.target);
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!fingers.has(event.pointerId)) {
      return;
    }
    fingers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (span && fingers.size === 2 && !touchDriven) {
      const [first, second] = fingers.values();
      follow(first, second, true);
    }
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (fingers.delete(event.pointerId) && !touchDriven) {
      span = 0;
    }
  };

  target.addEventListener("touchstart", onTouchStart as EventListener, options);
  target.addEventListener("touchmove", onTouchMove as EventListener, options);
  target.addEventListener("touchend", onTouchEnd as EventListener, options);
  target.addEventListener("touchcancel", onTouchEnd as EventListener, options);
  target.addEventListener("pointerdown", onPointerDown as EventListener, options);
  target.addEventListener("pointermove", onPointerMove as EventListener, options);
  target.addEventListener("pointerup", onPointerEnd as EventListener, options);
  target.addEventListener("pointercancel", onPointerEnd as EventListener, options);
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
  attachPinch(container, () => true, zoomBy, listening.signal, (left, top) => {
    container.scrollLeft += left;
    container.scrollTop += top;
  });
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
