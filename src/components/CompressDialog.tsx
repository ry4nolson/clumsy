import { useEffect, useRef } from "react";
import type { CompressRequest, CompressStatus } from "../hooks/useCompress";
import { compressLevels, formatBytes, savingLabel, type CompressLevelId } from "../lib/compressPlan";
import "./Compress.css";

type CompressDialogProps = {
  request: CompressRequest | null;
  status: CompressStatus;
  level: CompressLevelId;
  onLevel: (level: CompressLevelId) => void;
  onCompress: () => void;
  onClose: () => void;
};

function Outcome({ status }: { status: CompressStatus }) {
  if (status.kind === "working") {
    const { progress } = status;
    return (
      <div className="compress-outcome" role="status">
        <span>{progress?.total ? `Compressing image ${progress.done + 1} of ${progress.total}…` : "Reading the document…"}</span>
        <progress className="export-progress" max={progress?.total || undefined} value={progress?.total ? progress.done : undefined} />
      </div>
    );
  }
  if (status.kind === "ready") {
    return (
      <p className="compress-outcome compress-result" role="status">
        {savingLabel(status.before, status.after)}
      </p>
    );
  }
  return (
    <p className="compress-outcome" role="status">
      {status.kind === "small" ? `This setting can't make this PDF smaller than its ${formatBytes(status.before)}.` : `Couldn't compress this PDF. ${status.message}`}
    </p>
  );
}

export function CompressDialog({ request, status, level, onLevel, onCompress, onClose }: CompressDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("input:checked")?.focus();
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet compress"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (status.kind === "ready") {
            onCompress();
          }
        }}
      >
        <h2>Compress</h2>
        <p className="dialog-hint">Makes “{request?.name}” smaller by shrinking its images. Text and line drawings stay sharp, and nothing is written until you save.</p>
        <div className="compress-levels">
          {compressLevels.map((option) => (
            <label key={option.id} className="radio compress-level">
              <input type="radio" name="compress-level" checked={level === option.id} onChange={() => onLevel(option.id)} />
              <span>
                {option.label}
                <small>{option.hint}</small>
              </span>
            </label>
          ))}
        </div>
        <Outcome status={status} />
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={status.kind !== "ready"}>
            Compress
          </button>
        </div>
      </form>
    </dialog>
  );
}
