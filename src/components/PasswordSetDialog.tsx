import { useEffect, useRef, useState } from "react";

type PasswordSetDialogProps = {
  request: { changing: boolean } | null;
  onSet: (password: string) => void;
  onClose: () => void;
};

export function PasswordSetDialog({ request, onSet, onClose }: PasswordSetDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (request && dialog && !dialog.open) {
      setPassword("");
      setConfirm("");
      setVisible(false);
      dialog.showModal();
    } else if (!request && dialog?.open) {
      dialog.close();
    }
  }, [request]);

  const valid = password !== "" && password === confirm;
  const type = visible ? "text" : "password";

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) {
            onSet(password);
          }
        }}
      >
        <h2>{request?.changing ? "Change Password" : "Set Password"}</h2>
        <p className="dialog-hint">Anyone opening this PDF will need this password. It can't be recovered if it's lost.</p>
        <div className="label-form">
          <label className="label-form-name" htmlFor="set-password-new">
            New Password
          </label>
          <input
            id="set-password-new"
            className="text-input"
            type={type}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label className="label-form-name" htmlFor="set-password-confirm">
            Confirm
          </label>
          <input
            id="set-password-confirm"
            className="text-input"
            type={type}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>
        <div className="dialog-actions">
          <label className="checkbox">
            <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
            Show characters
          </label>
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={!valid}>
            {request?.changing ? "Change" : "Set"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
