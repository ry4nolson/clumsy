import { useEffect, useRef } from "react";
import type { UpdateInstall } from "../hooks/useUpdateInstall";
import { openExternal } from "../lib/platform";
import { appVersion, installProgress, isInstalling, type InstallState, type UpdateAvailable } from "../lib/updates";
import { ChangelogList } from "./ChangelogList";

type UpdateDialogProps = {
  offer: UpdateAvailable | null;
  updateInstall: UpdateInstall;
  onLater: () => void;
  onSkip: () => void;
  onDownload: () => void;
  onRestart: () => void;
};

export function InstallProgress({ install }: { install: InstallState }) {
  const progress = installProgress(install);
  if (!progress) {
    return null;
  }
  return (
    <div className="update-progress" aria-live="polite">
      <span>{progress.label}</span>
      <progress className="export-progress" max={1} value={progress.value} />
    </div>
  );
}

function summary(offer: UpdateAvailable, install: InstallState) {
  if (install.state === "installed") {
    return `Clumsy v${install.version} is installed. Restart to start using it, or it opens next time you launch Clumsy.`;
  }
  if (install.state === "failed") {
    return install.message;
  }
  return offer.releases.length > 1
    ? `Clumsy v${offer.latest} is ready (${offer.releases.length} releases since v${appVersion}).`
    : `Clumsy v${offer.latest} is ready. You’re on v${appVersion}.`;
}

export function UpdateDialog({ offer, updateInstall, onLater, onSkip, onDownload, onRestart }: UpdateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { install, start, dismissFailure } = updateInstall;
  const busy = isInstalling(install);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (offer && !dialog.open) {
      dialog.showModal();
    } else if (!offer && dialog.open) {
      dialog.close();
    }
  }, [offer]);

  const later = () => {
    dismissFailure();
    onLater();
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet update-dialog"
      onCancel={(event) => {
        event.preventDefault();
        later();
      }}
    >
      <h2>{install.state === "installed" ? "Update installed" : "Update available"}</h2>
      <p className="dialog-hint">{offer ? summary(offer, install) : null}</p>
      {offer && install.state !== "installed" && (
        <div className="update-dialog-notes">
          <ChangelogList releases={offer.releases} onOpenUrl={openExternal} expand="all" />
        </div>
      )}
      <InstallProgress install={install} />
      <div className="dialog-actions">
        {install.state === "idle" && (
          <button type="button" className="link-button" onClick={onSkip}>
            Skip this version
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="button" onClick={later}>
          Later
        </button>
        {install.state === "failed" && (
          <button type="button" className="button" onClick={start}>
            Try Again
          </button>
        )}
        {install.state === "installed" ? (
          <button type="button" className="button primary" onClick={onRestart}>
            Restart Now
          </button>
        ) : install.state === "failed" ? (
          <button
            type="button"
            className="button primary"
            onClick={() => {
              dismissFailure();
              onDownload();
            }}
          >
            Download
          </button>
        ) : (
          <button type="button" className="button primary" disabled={busy} onClick={start}>
            Install Update
          </button>
        )}
      </div>
    </dialog>
  );
}
