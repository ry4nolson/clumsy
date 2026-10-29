import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type RefObject, type WheelEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { MapMark, MapMarks } from "../hooks/useMapMarks";
import { rotateRect } from "../lib/diffRects";
import { MAP_MAX_WIDTH, MAP_PADDING, layoutMap, scrollForSlider, sliderFor, visibleRange, type MapArea, type MapRect, type PageBox, type ViewerScroll } from "../lib/documentMap";

const MIN_SLIDER_HEIGHT = 4;

type RenderQueue = (task: () => Promise<void>) => void;

function createQueue(): RenderQueue {
  let tail = Promise.resolve();
  return (task) => {
    tail = tail.then(task).catch(() => {});
  };
}

type Geometry = { boxes: PageBox[]; height: number };

function sameGeometry(a: Geometry, b: Geometry) {
  return (
    a.height === b.height &&
    a.boxes.length === b.boxes.length &&
    a.boxes.every((box, index) => box.top === b.boxes[index].top && box.width === b.boxes[index].width && box.height === b.boxes[index].height)
  );
}

function measure(container: HTMLElement): Geometry {
  const origin = container.getBoundingClientRect().top - container.scrollTop;
  const boxes = Array.from(container.querySelectorAll<HTMLElement>(".pdfViewer .page"), (div) => {
    const rect = div.getBoundingClientRect();
    return { top: rect.top - origin, width: rect.width, height: rect.height };
  });
  return { boxes, height: container.scrollHeight };
}

const scrollOf = (container: HTMLElement): ViewerScroll => ({
  scrollTop: container.scrollTop,
  clientHeight: container.clientHeight,
  scrollHeight: container.scrollHeight,
});

type MapPageProps = {
  pdfDocument: PDFDocumentProxy;
  index: number;
  rotation: number;
  rect: MapRect;
  renderWidth: number;
  visible: boolean;
  selected: boolean;
  marks: MapMark[] | undefined;
  queue: RenderQueue;
};

const MapPage = memo(function MapPage({ pdfDocument, index, rotation, rect, renderWidth, visible, selected, marks, queue }: MapPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(visible);
  if (visible && !shown) {
    setShown(true);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!shown || !canvas || !renderWidth) {
      return;
    }
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;
    queue(async () => {
      if (cancelled) {
        return;
      }
      const page = await pdfDocument.getPage(index + 1);
      if (cancelled) {
        return;
      }
      const turn = (page.rotate + rotation) % 360;
      const base = page.getViewport({ scale: 1, rotation: turn });
      const viewport = page.getViewport({ scale: (renderWidth * window.devicePixelRatio) / base.width, rotation: turn });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      renderTask = page.render({ canvas, viewport });
      await renderTask.promise;
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [shown, pdfDocument, index, rotation, renderWidth, queue]);

  return (
    <div
      className={`document-map-page${selected ? " selected" : ""}`}
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    >
      <canvas ref={canvasRef} />
      {marks?.map((mark, markIndex) => {
        const shownRect = rotateRect(mark, rotation);
        return (
          <span
            key={markIndex}
            className={`document-map-mark ${mark.kind}${mark.current ? " current" : ""}`}
            style={{ left: `${shownRect.x * 100}%`, top: `${shownRect.y * 100}%`, width: `${shownRect.width * 100}%`, height: `${shownRect.height * 100}%` }}
          />
        );
      })}
    </div>
  );
});

type DocumentMapProps = {
  pdfDocument: PDFDocumentProxy;
  containerRef: RefObject<HTMLDivElement | null>;
  rotation: number;
  selection: number[];
  marks: MapMarks;
};

export function DocumentMap({ pdfDocument, containerRef, rotation, selection, marks }: DocumentMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<number | null>(null);
  const [area, setArea] = useState<MapArea>({ width: MAP_MAX_WIDTH, height: 0 });
  const [geometry, setGeometry] = useState<Geometry>({ boxes: [], height: 0 });
  const [range, setRange] = useState({ first: 0, last: -1 });
  const [dragging, setDragging] = useState(false);
  const queue = useMemo(() => pdfDocument && createQueue(), [pdfDocument]);
  const layout = useMemo(() => layoutMap(geometry.boxes, geometry.height, area), [geometry, area]);
  const current = useRef({ layout, area });
  current.current = { layout, area };
  const selected = new Set(selection);
  const widest = Math.max(0, ...geometry.boxes.map((box) => box.width));
  const fullWidth = Math.max(0, area.width - 2 * MAP_PADDING);

  const paint = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    const slider = sliderRef.current;
    if (!container || !content || !slider) {
      return;
    }
    const { layout, area } = current.current;
    const { offset, top, height } = sliderFor(layout, area.height, scrollOf(container));
    content.style.transform = `translateY(${-offset}px)`;
    slider.style.transform = `translateY(${top}px)`;
    slider.style.height = `${Math.max(height, MIN_SLIDER_HEIGHT)}px`;
    const next = visibleRange(layout, offset, area.height);
    setRange((previous) => (previous.first === next.first && previous.last === next.last ? previous : next));
  }, [containerRef]);

  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const next = { width: MAP_MAX_WIDTH, height: map.clientHeight };
      setArea((previous) => (previous.width === next.width && previous.height === next.height ? previous : next));
    });
    observer.observe(map);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const pages = container?.querySelector(".pdfViewer");
    if (!container || !pages) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = measure(container);
      setGeometry((previous) => (sameGeometry(previous, next) ? previous : next));
      paint();
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(pages);
    observer.observe(container);
    container.addEventListener("scroll", paint, { passive: true });
    schedule();
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", paint);
      cancelAnimationFrame(frame);
    };
  }, [containerRef, pdfDocument, paint]);

  useLayoutEffect(paint, [paint, layout, area]);

  const dragTo = (clientY: number) => {
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map || grabRef.current === null) {
      return;
    }
    const { layout, area } = current.current;
    const sliderTop = clientY - map.getBoundingClientRect().top - grabRef.current;
    container.scrollTop = scrollForSlider(layout, area.height, scrollOf(container), sliderTop);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (event.button !== 0 || !container) {
      return;
    }
    event.preventDefault();
    const { layout, area } = current.current;
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const { top, height } = sliderFor(layout, area.height, scrollOf(container));
    grabRef.current = y >= top && y <= top + Math.max(height, MIN_SLIDER_HEIGHT) ? y - top : height / 2;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    dragTo(event.clientY);
  };

  const endDrag = () => {
    grabRef.current = null;
    setDragging(false);
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      return;
    }
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (containerRef.current?.clientHeight ?? 0) : 1;
    containerRef.current?.scrollBy({ top: event.deltaY * scale, left: event.deltaX * scale });
  };

  return (
    <div
      ref={mapRef}
      className={`document-map${dragging ? " dragging" : ""}`}
      style={{ width: layout.width || MAP_MAX_WIDTH }}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={(event) => dragTo(event.clientY)}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onWheel={onWheel}
    >
      <div ref={contentRef} className="document-map-content" style={{ height: layout.height }}>
        {layout.pages.map((rect, index) => (
          <MapPage
            key={index}
            pdfDocument={pdfDocument}
            index={index}
            rotation={rotation}
            rect={rect}
            renderWidth={widest ? Math.ceil((fullWidth * geometry.boxes[index].width) / widest) : 0}
            visible={index >= range.first && index <= range.last}
            selected={selected.has(index)}
            marks={marks.get(index)}
            queue={queue}
          />
        ))}
      </div>
      <div ref={sliderRef} className="document-map-slider" />
    </div>
  );
}
