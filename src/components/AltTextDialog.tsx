import { useEffect, useRef, useState } from "react";
import type { AltTextRequest } from "../lib/editorManagers";

type AltTextDialogProps = {
  request: AltTextRequest | null;
  onDone: (result: AltTextRequest | null) => void;
};

export function AltTextDialog({ request, onDone }: AltTextDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [altText, setAltText] = useState("");
  const [decorative, setDecorative] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog && !dialog.open) {
      setAltText(request.altText);
      setDecorative(request.decorative);
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
          onDone({ altText, decorative });
        }}
      >
        <h2>Alt Text</h2>
        <p className="dialog-hint">Alt text describes the image for people who can't see it, and is read out by screen readers.</p>
        <div className="alt-text-options">
          <label className="radio">
            <input type="radio" name="alt-text-kind" checked={!decorative} onChange={() => setDecorative(false)} />
            Add a description
          </label>
          <textarea
            className="text-input alt-text-input"
            value={altText}
            disabled={decorative}
            placeholder="For example, “A dog catching a frisbee in a park”"
            onChange={(event) => setAltText(event.target.value)}
          />
          <label className="radio">
            <input type="radio" name="alt-text-kind" checked={decorative} onChange={() => setDecorative(true)} />
            Mark as decorative
          </label>
          <p className="dialog-hint alt-text-note">For borders, watermarks, and other images that don't carry meaning.</p>
        </div>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
