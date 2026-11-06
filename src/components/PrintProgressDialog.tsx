import { useEffect, useRef } from "react";
import { ProgressView, type Progress } from "./ProgressView";

type PrintProgressDialogProps = {
  progress: Progress | null;
  onStop: () => void;
};

export function PrintProgressDialog({ progress, onStop }: PrintProgressDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (progress && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!progress && dialog?.open) {
      dialog.close();
    }
  }, [progress]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet export-images"
      onCancel={(event) => {
        event.preventDefault();
        onStop();
      }}
    >
      {progress && (
        <ProgressView
          title="Preparing to Print"
          note="This file can't be printed directly, so its pages print as images."
          progress={progress}
          onStop={onStop}
        />
      )}
    </dialog>
  );
}
