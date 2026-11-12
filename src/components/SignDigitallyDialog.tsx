import { useEffect, useRef, useState } from "react";
import type { SignaturePreview } from "../lib/editorManagers";
import { docMdpWords } from "../lib/signatureStatus";
import type { DocMdpPermission, EmptySignatureField, SigningIdentity } from "../lib/signatureTypes";
import { cleanTimestampUrl, preselectedIdentity, type Rect, type TargetChoice } from "../lib/signingTarget";
import { formatTime } from "./SignaturesList";
import { SignaturePath } from "./SignatureDialog";
import "./Signatures.css";

export type SignSheetRequest = {
  tabId: string;
  name: string;
  certify: boolean;
  identities: SigningIdentity[];
  emptyFields: EmptySignatureField[];
  corner: { page: number; rect: Rect };
  box: { page: number; rect: Rect } | null;
  pageLabels: string[] | null;
  signatures: SignaturePreview[];
  rememberedIdentity: string | null;
  timestampUrl: string;
  token: number;
};

export type SignChoices = {
  target: TargetChoice;
  appearance: string | null;
  identity: string;
  reason: string | null;
  location: string | null;
  timestampUrl: string;
  certify: DocMdpPermission | null;
};

type SignDigitallyDialogProps = {
  request: SignSheetRequest | null;
  hidden: boolean;
  onPlace: () => void;
  onSign: (choices: SignChoices) => void;
  onClose: () => void;
};

type TargetKey = `field:${string}` | "corner" | "box" | "invisible";

function targetOf(request: SignSheetRequest, key: TargetKey): TargetChoice | null {
  if (key.startsWith("field:")) {
    const field = request.emptyFields.find((entry) => `field:${entry.fieldName}` === key);
    return field ? { kind: "field", field } : null;
  }
  if (key === "box") {
    return request.box && { kind: "box", ...request.box };
  }
  return key === "corner" ? { kind: "corner", ...request.corner } : { kind: "invisible", page: request.corner.page };
}

function IdentityChoice({ identity, checked, onChange }: { identity: SigningIdentity; checked: boolean; onChange: () => void }) {
  const { certificate } = identity;
  const details = [`Issued by ${certificate.issuer}`, `expires ${formatTime(certificate.notAfter)}`, identity.hardware ? "security key" : null].filter(Boolean).join(", ");
  return (
    <label className="radio">
      <input type="radio" name="sign-identity" checked={checked} disabled={!identity.usable} onChange={onChange} />
      <span className="sign-choice-text">
        <span>{certificate.commonName}</span>
        <span className="sign-choice-detail">{details}</span>
        {identity.problems.map((problem) => (
          <span key={problem} className="sign-choice-detail problem">
            {problem}
          </span>
        ))}
        {identity.warnings.map((warning) => (
          <span key={warning} className="sign-choice-detail warning">
            {warning}
          </span>
        ))}
      </span>
    </label>
  );
}

export function SignDigitallyDialog({ request, hidden, onPlace, onSign, onClose }: SignDigitallyDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [identity, setIdentity] = useState<string | null>(null);
  const [target, setTarget] = useState<TargetKey>("corner");
  const [appearance, setAppearance] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [timestampUrl, setTimestampUrl] = useState("");
  const [permission, setPermission] = useState<DocMdpPermission>(2);
  const token = request?.token;

  useEffect(() => {
    if (!request) {
      return;
    }
    setIdentity(preselectedIdentity(request.identities, request.rememberedIdentity));
    setTarget(request.emptyFields[0] ? `field:${request.emptyFields[0].fieldName}` : "corner");
    setAppearance(request.signatures[0]?.uuid ?? null);
    setReason("");
    setLocation("");
    setTimestampUrl(request.timestampUrl);
    setPermission(2);
  }, [token]);

  useEffect(() => {
    if (request?.box) {
      setTarget("box");
    }
  }, [request?.box]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const shown = !!request && !hidden;
    if (shown && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!shown && dialog?.open) {
      dialog.close();
    }
  }, [request, hidden]);

  const pageText = (page: number) => request?.pageLabels?.[page - 1] ?? String(page);
  const choice = request ? targetOf(request, target) : null;
  const cleanUrl = cleanTimestampUrl(timestampUrl);
  const valid = !!request && !!identity && !!choice && !!cleanUrl;
  const verb = request?.certify ? "Certify" : "Sign";

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet sign-digitally"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {request && (
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && choice && identity && cleanUrl) {
              onSign({
                target: choice,
                appearance: choice.kind === "invisible" ? null : appearance,
                identity,
                reason: reason.trim() || null,
                location: location.trim() || null,
                timestampUrl: cleanUrl,
                certify: request.certify ? permission : null,
              });
            }
          }}
        >
          <h2>{request.certify ? "Certify Document" : "Sign Digitally"}</h2>
          <p className="dialog-hint">
            {request.certify ? "Certifying" : "Signing"} saves “{request.name}” with your certificate, so anyone can check who {request.certify ? "certified" : "signed"} it and whether it changed afterwards.
          </p>
          <div className="sign-form">
            <span className="label-form-name">Certificate</span>
            <div className="sign-choices">
              {request.identities.map((entry) => (
                <IdentityChoice key={entry.fingerprint} identity={entry} checked={identity === entry.fingerprint} onChange={() => setIdentity(entry.fingerprint)} />
              ))}
            </div>
            <span className="label-form-name">Place</span>
            <div className="sign-choices">
              {request.emptyFields.map((field) => (
                <label key={field.fieldName} className="radio">
                  <input type="radio" name="sign-target" checked={target === `field:${field.fieldName}`} onChange={() => setTarget(`field:${field.fieldName}`)} />
                  Empty field “{field.fieldName}”, page {pageText(field.page)}
                </label>
              ))}
              <label className="radio">
                <input type="radio" name="sign-target" checked={target === "corner"} onChange={() => setTarget("corner")} />
                Lower right of page {pageText(request.corner.page)}
              </label>
              <label className="radio">
                <input type="radio" name="sign-target" checked={target === "box"} disabled={!request.box} onChange={() => setTarget("box")} />
                {request.box ? `The box you drew on page ${pageText(request.box.page)}` : "A box you draw on the page"}
                <button type="button" className="button compact" onClick={onPlace}>
                  {request.box ? "Redraw…" : "Draw…"}
                </button>
              </label>
              <label className="radio">
                <input type="radio" name="sign-target" checked={target === "invisible"} onChange={() => setTarget("invisible")} />
                Invisible, with nothing drawn on the page
              </label>
            </div>
            {target !== "invisible" && (
              <>
                <span className="label-form-name">Appearance</span>
                <div className="sign-appearances" role="radiogroup" aria-label="Appearance">
                  <button type="button" role="radio" className="sign-appearance" aria-checked={appearance === null} onClick={() => setAppearance(null)}>
                    Text only
                  </button>
                  {request.signatures.map((preview) => (
                    <button
                      key={preview.uuid}
                      type="button"
                      role="radio"
                      className="sign-appearance"
                      aria-checked={appearance === preview.uuid}
                      aria-label={preview.description || "Saved signature"}
                      title={preview.description || "Saved signature"}
                      onClick={() => setAppearance(preview.uuid)}
                    >
                      <SignaturePath preview={preview} />
                    </button>
                  ))}
                </div>
              </>
            )}
            {request.certify && (
              <>
                <span className="label-form-name">Allow</span>
                <div className="sign-choices">
                  {([1, 2, 3] as const).map((value) => (
                    <label key={value} className="radio">
                      <input type="radio" name="sign-permission" checked={permission === value} onChange={() => setPermission(value)} />
                      {docMdpWords[value]}
                    </label>
                  ))}
                </div>
              </>
            )}
            <label className="label-form-name" htmlFor="sign-reason">
              Reason
            </label>
            <input id="sign-reason" className="text-input" placeholder="Optional" value={reason} onChange={(event) => setReason(event.target.value)} />
            <label className="label-form-name" htmlFor="sign-location">
              Location
            </label>
            <input id="sign-location" className="text-input" placeholder="Optional" value={location} onChange={(event) => setLocation(event.target.value)} />
            <details className="sign-advanced">
              <summary>Advanced</summary>
              <div className="label-form">
                <label className="label-form-name" htmlFor="sign-timestamp">
                  Timestamp server
                </label>
                <input
                  id="sign-timestamp"
                  className="text-input"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  aria-invalid={!cleanUrl}
                  value={timestampUrl}
                  onChange={(event) => setTimestampUrl(event.target.value)}
                />
              </div>
              <p className="sign-note">The timestamp proves when you signed. Only a fingerprint of the signature is sent to the server, never the document.</p>
            </details>
          </div>
          <div className="dialog-actions">
            <span className="spacer" />
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={!valid}>
              {verb}…
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
