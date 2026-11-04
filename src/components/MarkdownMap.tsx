import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type RefObject, type WheelEvent } from "react";
import { MAP_MAX_WIDTH, scrollForSlider, sliderFor, type ViewerScroll } from "../lib/documentMap";
import { documentLayout } from "../lib/markdownMap";
import { collectMarks, collectShapes, onlyFindMarks, paintShapes, type MapShapes } from "../lib/markdownMapShapes";
import type { MarkdownMode } from "../lib/tabs";

const MIN_SLIDER_HEIGHT = 4;
const COLLECT_DELAY = 120;

type MarkdownMapProps = {
  content: RefObject<HTMLElement | null>;
  container: RefObject<HTMLElement | null>;
  editorHost: RefObject<HTMLElement | null>;
  mode: MarkdownMode;
  view: () => ViewerScroll | null;
  scrollTo: (scrollTop: number) => void;
  scrollBy: (delta: number) => void;
};

export function MarkdownMap({ content, container, editorHost, mode, view, scrollTo, scrollBy }: MarkdownMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shapesRef = useRef<MapShapes | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const grabRef = useRef<number | null>(null);
  const [areaHeight, setAreaHeight] = useState(0);
  const [size, setSize] = useState({ width: 1, height: 0 });
  const [dragging, setDragging] = useState(false);
  const scale = MAP_MAX_WIDTH / Math.max(size.width, 1);
  const layout = useMemo(() => documentLayout(size.height, scale), [size, scale]);
  const current = useRef({ layout, areaHeight, view });
  current.current = { layout, areaHeight, view };

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const slider = sliderRef.current;
    const scroll = current.current.view();
    if (!canvas || !slider || !scroll) {
      return;
    }
    const { layout, areaHeight } = current.current;
    const { offset, top, height } = sliderFor(layout, areaHeight, scroll);
    slider.style.transform = `translateY(${top}px)`;
    slider.style.height = `${Math.max(height, MIN_SLIDER_HEIGHT)}px`;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(MAP_MAX_WIDTH * ratio);
    const pixels = Math.round(areaHeight * ratio);
    if (canvas.width !== width || canvas.height !== pixels) {
      canvas.width = width;
      canvas.height = pixels;
    }
    const context = canvas.getContext("2d");
    const shapes = shapesRef.current;
    if (!context || !shapes) {
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const background = mapRef.current ? getComputedStyle(mapRef.current).backgroundColor : "transparent";
    paintShapes(context, shapes, { scale: MAP_MAX_WIDTH / Math.max(shapes.width, 1), offset, width: MAP_MAX_WIDTH, height: areaHeight, background });
  }, []);

  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const observer = new ResizeObserver(() => setAreaHeight(map.clientHeight));
    observer.observe(map);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const article = content.current;
    if (!article) {
      return;
    }
    let timer = 0;
    let full = false;
    const collectNow = () => {
      timer = 0;
      if (!article.offsetWidth) {
        return;
      }
      if (full || !shapesRef.current) {
        shapesRef.current = collectShapes(article);
        setSize((previous) =>
          previous.width === article.offsetWidth && previous.height === article.offsetHeight ? previous : { width: article.offsetWidth, height: article.offsetHeight },
        );
      } else {
        shapesRef.current = { ...shapesRef.current, marks: collectMarks(article) };
      }
      full = false;
      paint();
    };
    const schedule = (everything: boolean) => {
      full ||= everything;
      timer ||= window.setTimeout(collectNow, COLLECT_DELAY);
    };
    const mutations = new MutationObserver((records) => schedule(!onlyFindMarks(records)));
    mutations.observe(article, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["src", "class"] });
    const resize = new ResizeObserver(() => schedule(true));
    resize.observe(article);
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const recolor = () => schedule(true);
    scheme.addEventListener("change", recolor);
    article.addEventListener("load", paint, true);
    full = true;
    collectNow();
    return () => {
      mutations.disconnect();
      resize.disconnect();
      scheme.removeEventListener("change", recolor);
      article.removeEventListener("load", paint, true);
      window.clearTimeout(timer);
    };
  }, [content, paint]);

  useEffect(() => {
    const box = container.current;
    const host = editorHost.current;
    box?.addEventListener("scroll", paint, { passive: true });
    host?.addEventListener("scroll", paint, { passive: true, capture: true });
    return () => {
      box?.removeEventListener("scroll", paint);
      host?.removeEventListener("scroll", paint, { capture: true });
    };
  }, [container, editorHost, paint]);

  useLayoutEffect(paint, [paint, layout, areaHeight, mode]);

  const dragTo = (clientY: number) => {
    const map = mapRef.current;
    const scroll = view();
    if (!map || !scroll || grabRef.current === null) {
      return;
    }
    const sliderTop = clientY - map.getBoundingClientRect().top - grabRef.current;
    scrollTo(scrollForSlider(layout, areaHeight, scroll, sliderTop));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const scroll = view();
    if (event.button !== 0 || !scroll) {
      return;
    }
    event.preventDefault();
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const { top, height } = sliderFor(layout, areaHeight, scroll);
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
    if (!event.ctrlKey && !event.metaKey) {
      scrollBy(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? areaHeight : 1));
    }
  };

  return (
    <div
      ref={mapRef}
      className={`document-map markdown-map${dragging ? " dragging" : ""}`}
      style={{ width: MAP_MAX_WIDTH }}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={(event) => dragTo(event.clientY)}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onWheel={onWheel}
    >
      <canvas ref={canvasRef} className="markdown-map-canvas" style={{ height: areaHeight }} />
      <div ref={sliderRef} className="document-map-slider" />
    </div>
  );
}
