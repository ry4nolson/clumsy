import { useEffect, useRef, useState } from "react";
import { dataUrlToFile, loadSavedSignature, storeSignature, trimmedSignature } from "../lib/signature";

type SignatureDialogProps = {
  open: boolean;
  onClose: () => void;
  onPlace: (file: File) => void;
};

export function SignatureDialog({ open, onClose, onPlace }: SignatureDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      const stored = loadSavedSignature();
      setSaved(stored);
      setDrawing(!stored);
      setHasInk(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !drawing || !canvas) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d")!;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.4;
    context.strokeStyle = "#111";
    setHasInk(false);
  }, [open, drawing]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPoint.current = point(event);
  };

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const from = lastPoint.current;
    if (!from) {
      return;
    }
    const to = point(event);
    const context = event.currentTarget.getContext("2d")!;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.quadraticCurveTo(from.x, from.y, (from.x + to.x) / 2, (from.y + to.y) / 2);
    context.lineTo(to.x, to.y);
    context.stroke();
    lastPoint.current = to;
    setHasInk(true);
  };

  const endStroke = () => {
    lastPoint.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasInk(false);
  };

  const place = async () => {
    const dataUrl = drawing ? (canvasRef.current ? trimmedSignature(canvasRef.current) : null) : saved;
    if (!dataUrl) {
      return;
    }
    if (drawing) {
      storeSignature(remember ? dataUrl : null);
    }
    onPlace(await dataUrlToFile(dataUrl, "signature.png"));
  };

  const forget = () => {
    storeSignature(null);
    setSaved(null);
    setDrawing(true);
  };

  return (
    <dialog ref={dialogRef} className="dialog sheet" onClose={onClose} onCancel={onClose}>
      <h2>Signature</h2>
      {drawing ? (
        <>
          <p className="dialog-hint">Draw your signature below. You can move and resize it after placing.</p>
          <canvas
            ref={canvasRef}
            className="signature-pad"
            onPointerDown={startStroke}
            onPointerMove={continueStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
          />
          <label className="checkbox">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Remember this signature
          </label>
        </>
      ) : (
        <div className="signature-saved">
          <img src={saved ?? undefined} alt="Saved signature" />
        </div>
      )}
      <div className="dialog-actions">
        {drawing ? (
          <>
            <button type="button" className="button" onClick={clear} disabled={!hasInk}>
              Clear
            </button>
            {saved && (
              <button type="button" className="button" onClick={() => setDrawing(false)}>
                Use saved
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="button" onClick={forget}>
              Forget
            </button>
            <button type="button" className="button" onClick={() => setDrawing(true)}>
              Draw new
            </button>
          </>
        )}
        <span className="spacer" />
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button primary" onClick={place} disabled={drawing && !hasInk}>
          Place
        </button>
      </div>
    </dialog>
  );
}
