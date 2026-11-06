export type Progress = { done: number; total: number };

type ProgressViewProps = {
  title: string;
  note?: string;
  progress: Progress;
  onStop: () => void;
};

export function ProgressView({ title, note, progress, onStop }: ProgressViewProps) {
  return (
    <>
      <h2>{title}</h2>
      {note && <p className="dialog-hint">{note}</p>}
      <p className="dialog-hint">
        Page {progress.done + 1} of {progress.total}
      </p>
      <progress className="export-progress" max={progress.total} value={progress.done} />
      <div className="dialog-actions">
        <span className="spacer" />
        <button type="button" className="button" onClick={onStop}>
          Cancel
        </button>
      </div>
    </>
  );
}
