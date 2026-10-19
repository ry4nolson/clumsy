import { useEffect, useRef, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import appIcon from "../../src-tauri/icons/128x128@2x.png";
import type { DefaultAppStatus } from "../lib/defaultApp";

export type DefaultAppRequest = { status: DefaultAppStatus; source: "launch" | "manual"; token: number };

type DefaultAppDialogProps = {
  request: DefaultAppRequest | null;
  onMakeDefault: () => Promise<DefaultAppStatus>;
  onDismiss: (choice: { neverAsk: boolean; source: DefaultAppRequest["source"] }) => void;
  onClose: () => void;
};

type Phase = { state: "asking" } | { state: "working" } | { state: "done" } | { state: "error"; message: string };

export function DefaultAppDialog({ request, onMakeDefault, onDismiss, onClose }: DefaultAppDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>({ state: "asking" });
  const [neverAsk, setNeverAsk] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (request) {
      setPhase(request.status.isDefault ? { state: "done" } : { state: "asking" });
      setNeverAsk(false);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [request]);

  const dismiss = () => {
    if (request && phase.state === "asking") {
      onDismiss({ neverAsk, source: request.source });
    }
    onClose();
  };

  const confirm = async () => {
    setPhase({ state: "working" });
    try {
      const status = await onMakeDefault();
      setPhase(
        status.isDefault
          ? { state: "done" }
          : { state: "error", message: `macOS still opens PDFs with ${status.currentApp ?? "another app"}.` },
      );
    } catch (error) {
      setPhase({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const currentApp = request?.status.currentApp;

  return (
    <dialog
      ref={dialogRef}
      className="dialog default-app-dialog"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <img src={appIcon} alt="" width={72} height={72} />
      {phase.state === "done" ? (
        <>
          <h2>
            <CircleCheck size={18} className="tone-current" /> Clumsy opens your PDFs
          </h2>
          <p className="dialog-hint">Double-clicking a PDF in Finder now opens it here. You can change this anytime from Finder’s Get Info window.</p>
          <div className="dialog-actions">
            <span className="spacer" />
            <button type="button" className="button primary" onClick={onClose} autoFocus>
              OK
            </button>
          </div>
        </>
      ) : (
        <>
          <h2>Make Clumsy your default PDF app?</h2>
          <p className="dialog-hint">
            {currentApp ? (
              <>
                PDFs currently open in <strong>{currentApp}</strong>.{" "}
              </>
            ) : null}
            Make Clumsy the app that opens PDFs when you double-click them in Finder.
          </p>
          {phase.state === "error" && (
            <p className="default-app-error">
              <TriangleAlert size={14} /> {phase.message}
            </p>
          )}
          <div className="dialog-actions">
            {request?.source === "launch" && (
              <label className="checkbox">
                <input type="checkbox" checked={neverAsk} onChange={(event) => setNeverAsk(event.target.checked)} />
                Don’t ask again
              </label>
            )}
            <span className="spacer" />
            <button type="button" className="button" onClick={dismiss} disabled={phase.state === "working"}>
              Not Now
            </button>
            <button type="button" className="button primary" onClick={confirm} disabled={phase.state === "working"} autoFocus>
              {phase.state === "working" ? "Setting…" : "Make Default"}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
