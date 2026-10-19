import { memo, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const THUMB_WIDTH = 120;

type ThumbnailProps = {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  aspectRatio: number;
  active: boolean;
  onSelect: (page: number) => void;
};

const Thumbnail = memo(function Thumbnail({ pdfDocument, pageNumber, aspectRatio, active, onSelect }: ThumbnailProps) {
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

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`thumbnail${active ? " active" : ""}`}
      onClick={() => onSelect(pageNumber)}
      aria-label={`Page ${pageNumber}`}
      aria-current={active ? "page" : undefined}
    >
      <span className="thumbnail-page" style={{ aspectRatio }}>
        <canvas ref={canvasRef} />
      </span>
      <span className="thumbnail-label">{pageNumber}</span>
    </button>
  );
});

type ThumbnailsProps = {
  pdfDocument: PDFDocumentProxy;
  currentPage: number;
  onSelect: (page: number) => void;
};

export function Thumbnails({ pdfDocument, currentPage, onSelect }: ThumbnailsProps) {
  const [aspectRatio, setAspectRatio] = useState(0.77);

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

  return (
    <div className="thumbnails">
      {Array.from({ length: pdfDocument.numPages }, (_, index) => (
        <Thumbnail
          key={index}
          pdfDocument={pdfDocument}
          pageNumber={index + 1}
          aspectRatio={aspectRatio}
          active={currentPage === index + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
