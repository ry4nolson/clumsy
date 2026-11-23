import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { alignmentFrom, type Point } from "../lib/alignment";
import type { Matrix } from "../lib/contentPlacements";

export type AlignSide = { doc: PDFDocumentProxy; page: number; name: string; label: string; color: string };

export type AlignRequest = { previous: AlignSide; current: AlignSide };

type AlignPointsDialogProps = {
  request: AlignRequest | null;
  onDone: (alignment: Matrix) => void;
  onClose: () => void;
};

const MAX_POINTS = 3;
const MAX_PIXELS = 16_000_000;
const zoomSteps = [1, 2, 4, 8];

function AlignPane({ side, title, points, onPoints }: { side: AlignSide; title: string; points: Point[]; onPoints: (points: Point[]) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const center = useRef({ x: 0.5, y: 0.5 });
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [fit, setFit] = useState(0);
  const [zoom, setZoom] = useState(1);
  const size = page?.getViewport({ scale: 1 });
  const shown = fit * zoom;

  useEffect(() => {
    let stale = false;
    side.doc.getPage(side.page + 1).then(
      (loaded) => {
        const area = scrollRef.current;
        if (stale || !area) {
          return;
        }
        const natural = loaded.getViewport({ scale: 1 });
        setFit(Math.max(0.05, Math.min((area.clientWidth - 2) / natural.width, (area.clientHeight - 2) / natural.height)));
        setPage(loaded);
      },
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, [side.doc, side.page]);

  useEffect(() => () => void page?.cleanup(), [page]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas || !size || !shown) {
      return;
    }
    const width = size.width * shown;
    const height = size.height * shown;
    const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (width * height)));
    const viewport = page.getViewport({ scale: shown * ratio });
    const buffer = document.createElement("canvas");
    buffer.width = Math.max(1, Math.round(viewport.width));
    buffer.height = Math.max(1, Math.round(viewport.height));
    const task = page.render({ canvas: buffer, viewport });
    task.promise.then(
      () => {
        canvas.width = buffer.width;
        canvas.height = buffer.height;
        canvas.getContext("2d")?.drawImage(buffer, 0, 0);
        buffer.width = 0;
        buffer.height = 0;
      },
      () => {
        buffer.width = 0;
        buffer.height = 0;
      },
    );
    return () => task.cancel();
  }, [page, shown]);

  useLayoutEffect(() => {
    const area = scrollRef.current;
    if (area) {
      area.scrollLeft = center.current.x * area.scrollWidth - area.clientWidth / 2;
      area.scrollTop = center.current.y * area.scrollHeight - area.clientHeight / 2;
    }
  }, [zoom]);

  const zoomTo = (next: number) => {
    const area = scrollRef.current;
    if (area && area.scrollWidth && area.scrollHeight) {
      center.current = { x: (area.scrollLeft + area.clientWidth / 2) / area.scrollWidth, y: (area.scrollTop + area.clientHeight / 2) / area.scrollHeight };
    }
    setZoom(next);
  };

  const step = (by: number) => zoomTo(zoomSteps[Math.min(zoomSteps.length - 1, Math.max(0, zoomSteps.indexOf(zoom) + by))]);

  return (
    <section className="align-pane">
      <header className="align-pane-header">
        <strong>
          <span className="overlay-swatch" style={{ background: side.color }} />
          {title}
        </strong>
        <span className="align-pane-name" title={side.name}>
          {side.name} · {side.label}
        </span>
        <span className="spacer" />
        <button type="button" className="button" disabled={zoom === zoomSteps[0]} onClick={() => step(-1)} aria-label={`Zoom out on ${title}`}>
          −
        </button>
        <span className="align-zoom">{zoom}×</span>
        <button type="button" className="button" disabled={zoom === zoomSteps[zoomSteps.length - 1]} onClick={() => step(1)} aria-label={`Zoom in on ${title}`}>
          +
        </button>
        <button type="button" className="button" disabled={!points.length} onClick={() => onPoints(points.slice(0, -1))}>
          Undo Point
        </button>
      </header>
      <div ref={scrollRef} className="align-scroll">
        {size && (
          <div
            className="align-page"
            style={{ width: size.width * shown, height: size.height * shown }}
            onClick={(event) => {
              if (points.length >= MAX_POINTS) {
                return;
              }
              const box = event.currentTarget.getBoundingClientRect();
              onPoints([...points, { x: (event.clientX - box.left) / shown, y: size.height - (event.clientY - box.top) / shown }]);
            }}
          >
            <canvas ref={canvasRef} />
            {points.map((point, index) => (
              <span key={index} className="align-point" style={{ left: point.x * shown, top: (size.height - point.y) * shown, borderColor: side.color, color: side.color }}>
                <b>{index + 1}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function AlignPointsDialog({ request, onDone, onClose }: AlignPointsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [previous, setPrevious] = useState<Point[]>([]);
  const [current, setCurrent] = useState<Point[]>([]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog && !dialog.open) {
      setPrevious([]);
      setCurrent([]);
      dialog.showModal();
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  const count = Math.min(previous.length, current.length);
  const matched = previous.length === current.length && count >= 2;
  const alignment = matched ? alignmentFrom(previous, current) : null;
  const hint = !matched
    ? previous.length !== current.length && count >= 2
      ? "Click the same number of points on both drawings."
      : `Point ${count + 1}: click it on ${previous.length <= current.length ? "the previous drawing" : "the current drawing"}.`
    : alignment
      ? count === 2
        ? "Two points line the drawings up. A third also corrects a skewed scan."
        : "Three points set."
      : "Those points are too close together. Undo one and pick points farther apart.";

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet align-points"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2>Align by Points</h2>
      <p className="dialog-hint">
        Click the same two spots on each drawing, in the same order. Two grid intersections or title block corners far apart work best. Zoom in to click precisely.
      </p>
      {request && (
        <div className="align-panes">
          <AlignPane side={request.previous} title="Previous" points={previous} onPoints={setPrevious} />
          <AlignPane side={request.current} title="Current" points={current} onPoints={setCurrent} />
        </div>
      )}
      <div className="dialog-actions">
        <span className="align-hint" role="status">
          {hint}
        </span>
        <span className="spacer" />
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button primary" disabled={!alignment} onClick={() => alignment && onDone(alignment)}>
          Use These Points
        </button>
      </div>
    </dialog>
  );
}
