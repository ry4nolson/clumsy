import { useEffect, useRef, useState, type PointerEvent } from "react";
import { pickImage } from "../lib/imageFiles";
import { shapePreview, type DescriptionRequest, type DrawnCurves, type ShapePreview, type SignatureLines, type SignatureRequest } from "../lib/editorManagers";

type SignatureTab = "type" | "draw" | "image";

export type SignatureResult = { lines: SignatureLines; description: string; save: boolean };

type SignatureDialogProps = {
  request: SignatureRequest | null;
  onDone: (result: SignatureResult | null) => void;
};

const tabs: Array<[SignatureTab, string]> = [
  ["type", "Type"],
  ["draw", "Draw"],
  ["image", "Image"],
];

export function SignaturePath({ preview, className }: { preview: ShapePreview; className?: string }) {
  return (
    <svg className={className} viewBox={preview.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path className={preview.areContours ? "contours" : "lines"} d={preview.path} />
    </svg>
  );
}

function smoothed(points: number[]) {
  let path = `M ${points[0]} ${points[1]}`;
  for (let index = 2; index < points.length; index += 2) {
    if (index < 4) {
      path += ` L ${points[index]} ${points[index + 1]}`;
      continue;
    }
    const [x1, y1, x2, y2, x, y] = points.slice(index - 4, index + 2);
    path += ` C ${(x1 + 5 * x2) / 6} ${(y1 + 5 * y2) / 6} ${(5 * x2 + x) / 6} ${(5 * y2 + y) / 6} ${(x2 + x) / 2} ${(y2 + y) / 2}`;
  }
  return points.length === 2 ? `${path} L ${points[0]} ${points[1]}` : path;
}

type CurvesUpdate = (current: DrawnCurves | null) => DrawnCurves | null;

function DrawPad({ curves, thickness, onChange }: { curves: DrawnCurves | null; thickness: number; onChange: (update: CurvesUpdate) => void }) {
  const pointer = useRef<number | null>(null);

  const point = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [Math.round(event.clientX - rect.left), Math.round(event.clientY - rect.top), rect.width, rect.height];
  };

  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (pointer.current !== null) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = event.pointerId;
    const [x, y, width, height] = point(event);
    onChange((current) => {
      const base = current ?? { width, height, thickness, curves: [] };
      return { ...base, curves: [...base.curves, { points: [x, y] }] };
    });
  };

  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (pointer.current !== event.pointerId) {
      return;
    }
    const [x, y, width, height] = point(event);
    if (x < 0 || y < 0 || x > width || y > height) {
      return;
    }
    onChange((current) => {
      const last = current?.curves.at(-1)?.points;
      if (!current || !last || (x === last.at(-2) && y === last.at(-1))) {
        return current;
      }
      return { ...current, curves: [...current.curves.slice(0, -1), { points: [...last, x, y] }] };
    });
  };

  const end = (event: PointerEvent<SVGSVGElement>) => {
    if (pointer.current === event.pointerId) {
      pointer.current = null;
    }
  };

  return (
    <svg className="signature-pad" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onContextMenu={(event) => event.preventDefault()}>
      {curves?.curves.map((curve, index) => (
        <path key={index} d={smoothed(curve.points)} strokeWidth={curves.thickness} />
      ))}
      {!curves && (
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="signature-placeholder">
          Draw your signature here
        </text>
      )}
    </svg>
  );
}

export function SignatureDialog({ request, onDone }: SignatureDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const typeRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<SignatureTab>("type");
  const [typed, setTyped] = useState("");
  const [curves, setCurves] = useState<DrawnCurves | null>(null);
  const [thickness, setThickness] = useState(2);
  const [image, setImage] = useState<{ lines: SignatureLines | null; name: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [description, setDescription] = useState("");
  const [described, setDescribed] = useState(false);
  const [save, setSave] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog && !dialog.open) {
      setTab("type");
      setTyped("");
      setCurves(null);
      setImage(null);
      setDescription("");
      setDescribed(false);
      setSave(!request.full);
      setError(null);
      dialog.showModal();
      typeRef.current?.focus();
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  const suggest = (text: string) => {
    if (!described) {
      setDescription(text);
    }
  };

  const chooseTab = (next: SignatureTab) => {
    setTab(next);
    setError(null);
    suggest(next === "type" ? typed : next === "draw" ? (curves ? "Signature" : "") : (image?.name ?? ""));
  };

  const readImage = async () => {
    const file = request && (await pickImage());
    if (!file) {
      return;
    }
    setReading(true);
    setError(null);
    const lines = await request.fromImage(file).catch(() => null);
    setReading(false);
    setImage({ lines, name: file.name.replace(/\.[^.]+$/, "") });
    if (!lines) {
      setError("Couldn't find a signature in that image. Try one with dark ink on a light background.");
      return;
    }
    suggest(file.name.replace(/\.[^.]+$/, ""));
  };

  const ready = tab === "type" ? !!typed.trim() : tab === "draw" ? !!curves?.curves.length : !!image?.lines;
  const imagePreview = shapePreview(image?.lines ?? null);

  const add = () => {
    if (!request || !ready) {
      return;
    }
    let lines: SignatureLines | null = null;
    if (tab === "type" && typeRef.current) {
      const { fontFamily, fontStyle, fontWeight } = getComputedStyle(typeRef.current);
      lines = request.fromText(typed.trim(), { fontFamily, fontStyle, fontWeight });
    } else if (tab === "draw" && curves) {
      lines = request.fromDrawing(curves);
    } else if (tab === "image") {
      lines = image?.lines ?? null;
    }
    if (!lines) {
      setError("Couldn't turn this into a signature.");
      return;
    }
    onDone({ lines, description: description.trim(), save: save && !request.full });
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet signature-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onDone(null);
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <div className="signature-header">
          <h2>Add Signature</h2>
          <div className="about-tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => chooseTab(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="signature-area">
          {tab === "type" && (
            <input
              ref={typeRef}
              className="signature-type"
              value={typed}
              placeholder="Type your name"
              aria-label="Type your signature"
              onChange={(event) => {
                setTyped(event.target.value);
                suggest(event.target.value);
              }}
            />
          )}
          {tab === "draw" && (
            <DrawPad
              curves={curves}
              thickness={thickness}
              onChange={(update) => {
                setCurves(update);
                suggest("Signature");
              }}
            />
          )}
          {tab === "image" && (
            <div className="signature-drop">
              {imagePreview ? (
                <SignaturePath preview={imagePreview} className="signature-preview" />
              ) : (
                <p className="dialog-hint">{reading ? "Reading image…" : "Use a photo or scan of your signature on plain paper"}</p>
              )}
              <button type="button" className="button small" disabled={reading} onClick={readImage}>
                {imagePreview ? "Choose Another Image…" : "Choose Image…"}
              </button>
            </div>
          )}
        </div>
        <div className="signature-controls">
          {tab === "draw" && (
            <label className="tool-option" title={`Thickness: ${thickness}`}>
              Thickness
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={thickness}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setThickness(value);
                  setCurves((current) => current && { ...current, thickness: value });
                }}
              />
            </label>
          )}
          <span className="spacer" />
          <button
            type="button"
            className="button small"
            disabled={!ready && !image}
            onClick={() => {
              setTyped("");
              setCurves(null);
              setImage(null);
              setError(null);
              suggest("");
            }}
          >
            Clear
          </button>
        </div>
        {error && <p className="signature-error">{error}</p>}
        <label className="signature-description">
          Description (alt text)
          <input
            className="text-input"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setDescribed(true);
            }}
          />
        </label>
        <div className="dialog-actions">
          <label className="checkbox" title={request?.full ? "You've saved 5 signatures. Remove one from the toolbar to save another." : undefined}>
            <input type="checkbox" checked={save && !request?.full} disabled={request?.full} onChange={(event) => setSave(event.target.checked)} />
            {request?.full ? "5 signatures saved" : "Save signature"}
          </label>
          <span className="spacer" />
          <button type="button" className="button" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={!ready}>
            Add
          </button>
        </div>
      </form>
    </dialog>
  );
}

type DescriptionDialogProps = {
  request: DescriptionRequest | null;
  onDone: (description: string | null) => void;
};

export function SignatureDescriptionDialog({ request, onDone }: DescriptionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [description, setDescription] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog && !dialog.open) {
      setDescription(request.description);
      dialog.showModal();
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet"
      onCancel={(event) => {
        event.preventDefault();
        onDone(null);
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onDone(description.trim());
        }}
      >
        <h2>Signature Description</h2>
        {request && <SignaturePath preview={request.preview} className="signature-preview framed" />}
        <label className="signature-description">
          Description (alt text)
          <input className="text-input" value={description} autoFocus onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={description.trim() === request?.description}>
            Update
          </button>
        </div>
      </form>
    </dialog>
  );
}
