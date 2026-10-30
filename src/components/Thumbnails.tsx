import { memo, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { slotAt } from "../lib/dropTarget";
import type { SelectModifiers } from "../lib/pageSelection";

const THUMB_WIDTH = 120;
const DRAG_THRESHOLD = 5;
const AUTOSCROLL_EDGE = 40;

type ThumbnailProps = {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  label: string | null;
  aspectRatio: number;
  active: boolean;
  selected: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  onPointerDown: (page: number, event: PointerEvent<HTMLButtonElement>) => void;
  onClick: (page: number, event: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (page: number, event: MouseEvent<HTMLButtonElement>) => void;
};

const Thumbnail = memo(function Thumbnail({
  pdfDocument,
  pageNumber,
  label,
  aspectRatio,
  active,
  selected,
  dropBefore,
  dropAfter,
  onPointerDown,
  onClick,
  onContextMenu,
}: ThumbnailProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = buttonRef.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "400px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas) {
      return;
    }
    let cancelled = false;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;
    pdfDocument.getPage(pageNumber).then((page) => {
      if (cancelled) {
        return;
      }
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (THUMB_WIDTH * window.devicePixelRatio) / base.width });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.parentElement!.style.aspectRatio = `${base.width} / ${base.height}`;
      renderTask = page.render({ canvas, viewport });
      renderTask.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [visible, pdfDocument, pageNumber]);

  useEffect(() => {
    if (active) {
      buttonRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  const classes = ["thumbnail", active && "active", selected && "selected", dropBefore && "drop-before", dropAfter && "drop-after"];

  return (
    <button
      ref={buttonRef}
      type="button"
      className={classes.filter(Boolean).join(" ")}
      data-page={pageNumber - 1}
      onPointerDown={(event) => onPointerDown(pageNumber - 1, event)}
      onClick={(event) => onClick(pageNumber - 1, event)}
      onContextMenu={(event) => onContextMenu(pageNumber - 1, event)}
      aria-label={label ? `Page ${label} (${pageNumber})` : `Page ${pageNumber}`}
      aria-current={active ? "page" : undefined}
      aria-pressed={selected}
    >
      <span className="thumbnail-page" style={{ aspectRatio }}>
        <canvas ref={canvasRef} />
      </span>
      <span className="thumbnail-label">{label ?? pageNumber}</span>
    </button>
  );
});

type Drag = { page: number; startY: number; active: boolean; slot: number | null };

type ThumbnailsProps = {
  pdfDocument: PDFDocumentProxy;
  currentPage: number;
  pageLabels: string[] | null;
  selection: number[];
  onSelect: (page: number, modifiers: SelectModifiers) => void;
  onMove: (page: number, slot: number) => void;
  onContextMenu: (page: number) => void;
  onDelete: () => void;
};

export function Thumbnails({ pdfDocument, currentPage, pageLabels, selection, onSelect, onMove, onContextMenu, onDelete }: ThumbnailsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [aspectRatio, setAspectRatio] = useState(0.77);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const suppressClick = useRef(false);
  const selected = new Set(selection);

  useEffect(() => {
    let cancelled = false;
    pdfDocument.getPage(1).then((page) => {
      if (!cancelled) {
        const { width, height } = page.getViewport({ scale: 1 });
        setAspectRatio(width / height);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDocument]);

  const startDrag = (page: number, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    suppressClick.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers can't be captured; the drag still works inside the sidebar.
    }
    setDrag({ page, startY: event.clientY, active: false, slot: null });
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    const container = containerRef.current;
    if (!current || !container) {
      return;
    }
    const active = current.active || Math.abs(event.clientY - current.startY) > DRAG_THRESHOLD;
    if (!active) {
      return;
    }
    const scroller = container.parentElement;
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      if (event.clientY < bounds.top + AUTOSCROLL_EDGE) {
        scroller.scrollBy(0, -12);
      } else if (event.clientY > bounds.bottom - AUTOSCROLL_EDGE) {
        scroller.scrollBy(0, 12);
      }
    }
    setDrag({ ...current, active, slot: slotAt(container, event.clientY) });
  };

  const endDrag = () => {
    const current = dragRef.current;
    setDrag(null);
    if (current?.active && current.slot !== null) {
      suppressClick.current = true;
      onMove(current.page, current.slot);
    }
  };

  const click = (page: number, event: MouseEvent<HTMLButtonElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSelect(page, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey });
  };

  const contextMenu = (page: number, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!selected.has(page)) {
      onSelect(page, { toggle: false, range: false });
    }
    onContextMenu(page);
  };

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDelete();
    } else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !event.metaKey && !event.altKey && !event.ctrlKey) {
      event.preventDefault();
      const next = currentPage - 1 + (event.key === "ArrowUp" ? -1 : 1);
      if (next >= 0 && next < pdfDocument.numPages) {
        onSelect(next, { toggle: false, range: event.shiftKey });
      }
    }
  };

  const slot = drag?.active ? drag.slot : null;

  return (
    <div
      ref={containerRef}
      className={`thumbnails${drag?.active ? " dragging" : ""}`}
      tabIndex={0}
      onKeyDown={keyDown}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={() => setDrag(null)}
    >
      {Array.from({ length: pdfDocument.numPages }, (_, index) => (
        <Thumbnail
          key={index}
          pdfDocument={pdfDocument}
          pageNumber={index + 1}
          label={pageLabels?.[index] || null}
          aspectRatio={aspectRatio}
          active={currentPage === index + 1}
          selected={selected.has(index)}
          dropBefore={slot === index}
          dropAfter={slot === pdfDocument.numPages && index === pdfDocument.numPages - 1}
          onPointerDown={startDrag}
          onClick={click}
          onContextMenu={contextMenu}
        />
      ))}
    </div>
  );
}
