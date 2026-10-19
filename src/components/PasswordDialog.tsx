import { useEffect, useRef, useState } from "react";

type PasswordDialogProps = {
  request: { fileName: string; incorrect: boolean } | null;
  onSubmit: (password: string | null) => void;
};

export function PasswordDialog({ request, onSubmit }: PasswordDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog && !dialog.open) {
      setPassword("");
      dialog.showModal();
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault();
        onSubmit(null);
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(password);
        }}
      >
        <h2>Password required</h2>
        <p className="dialog-hint">
          {request?.incorrect ? "Incorrect password. Try again." : `“${request?.fileName}” is protected.`}
        </p>
        <input
          className="text-input"
          type="password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" className="button" onClick={() => onSubmit(null)}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Open
          </button>
        </div>
      </form>
    </dialog>
  );
}
