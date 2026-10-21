import { useEffect, useRef } from "react";
import { openExternal } from "../lib/platform";
import { appVersion, type UpdateAvailable } from "../lib/updates";
import { ChangelogList } from "./ChangelogList";

type UpdateDialogProps = {
  offer: UpdateAvailable | null;
  onLater: () => void;
  onSkip: () => void;
  onDownload: () => void;
};

export function UpdateDialog({ offer, onLater, onSkip, onDownload }: UpdateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet update-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onLater();
      }}
    >
      <h2>Update available</h2>
      <p className="dialog-hint">
        {offer
          ? offer.releases.length > 1
            ? `Clumsy v${offer.latest} is ready (${offer.releases.length} releases since v${appVersion}).`
            : `Clumsy v${offer.latest} is ready. You’re on v${appVersion}.`
          : null}
      </p>
      {offer && (
        <div className="update-dialog-notes">
          <ChangelogList releases={offer.releases} onOpenUrl={openExternal} expand="all" />
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="link-button" onClick={onSkip}>
          Skip this version
        </button>
        <span className="spacer" />
        <button type="button" className="button" onClick={onLater}>
          Later
        </button>
        <button type="button" className="button primary" onClick={onDownload}>
          Download
        </button>
      </div>
    </dialog>
  );
}
