import { useEffect, useRef } from "react";
import type { TabSignatures } from "../hooks/useTabSignatures";
import { canSignDigitally } from "../lib/platform";
import { canTrust, CHANGED_AFTER, docMdpWords, kindLabel, signerName, statusWords, type SignatureRow } from "../lib/signatureStatus";
import type { CertificateSummary, SignatureVerdict } from "../lib/signatureTypes";
import { formatTime, signingTimeText } from "./SignaturesList";
import { SignatureStatusIcon } from "./SignatureStatusIcon";

const revocationWords: Record<SignatureVerdict["revocation"], string> = {
  good: "Not revoked",
  revoked: "Revoked",
  unknown: "Couldn't be checked",
  "not-checked": "Not checked",
};

const integrityWords: Record<SignatureVerdict["integrity"], string> = {
  intact: "Unchanged since signing",
  altered: "Altered after signing",
  malformed: "The signature is damaged",
};

function revocationText(verdict: SignatureVerdict) {
  const source = verdict.revocationSource === "embedded" ? " (from data in the file)" : verdict.revocationSource === "online" ? " (checked online)" : "";
  return `${revocationWords[verdict.revocation]}${source}`;
}

function certificateLine(certificate: CertificateSummary) {
  return [certificate.commonName, certificate.organization].filter(Boolean).join(", ");
}

function Facts({ row }: { row: SignatureRow }) {
  const { signature, verdict } = row;
  const signer = verdict?.signer;
  const time = signingTimeText(row);
  const facts: Array<[string, string | null | undefined]> = [
    ["Kind", kindLabel(signature)],
    ["Signer", signer ? certificateLine(signer) : signature.name],
    ["Email", signer?.email],
    ["Issued by", signer?.issuer],
    ["Valid", signer ? `${formatTime(signer.notBefore)} to ${formatTime(signer.notAfter)}` : null],
    ["Signed", time],
    ["Timestamp from", verdict?.signingTime?.authority],
    ["Document", verdict ? integrityWords[verdict.integrity] : null],
    ["Later changes", signature.coversWholeFile ? "None" : signature.modifiedAfter ? `${CHANGED_AFTER} (${signature.laterRevisions} ${signature.laterRevisions === 1 ? "revision" : "revisions"} added)` : "Only signatures, timestamps, or validation data added"],
    ["Allows", signature.docMdp ? docMdpWords[signature.docMdp] : null],
    ["Revocation", verdict ? revocationText(verdict) : null],
    ["Level", verdict?.level ? `PAdES ${verdict.level}` : null],
    ["Algorithm", verdict?.digestAlgorithm ? `${verdict.signatureAlgorithm} with ${verdict.digestAlgorithm}` : null],
    ["Reason", signature.reason],
    ["Location", signature.location],
    ["Contact", signature.contactInfo],
    ["Field", signature.fieldName],
  ];
  return (
    <dl className="signature-facts">
      {facts
        .filter((fact): fact is [string, string] => !!fact[1])
        .map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}

export function SignatureDetailsDialog({ signatures }: { signatures: TabSignatures }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const row = signatures.details;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (row && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!row && dialog?.open) {
      dialog.close();
    }
  }, [row]);

  const verdict = row?.verdict ?? null;
  const fingerprint = verdict?.signer?.fingerprint;
  const problems = [...(row?.signature.problems ?? []), ...(verdict?.problems ?? [])];

  return (
    <dialog
      ref={dialogRef}
      className="dialog sheet signature-details"
      onCancel={(event) => {
        event.preventDefault();
        signatures.closeDetails();
      }}
    >
      {row && (
        <>
          <h2 className="signature-heading">
            <SignatureStatusIcon status={verdict?.status ?? (signatures.loading ? null : "unknown")} size={20} />
            {signerName(row)}
          </h2>
          <p className="dialog-hint">
            {verdict ? statusWords[verdict.status].sentence : signatures.loading ? "Checking the signature…" : statusWords.unknown.sentence}
            {verdict?.trustedInClumsy && " You chose to trust this signer in Clumsy; other apps won't know that."}
          </p>
          <Facts row={row} />
          {problems.length > 0 && (
            <ul className="signature-problems">
              {[...new Set(problems)].map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {verdict && verdict.chain.length > 1 && (
            <div className="signature-chain">
              <h3>Certificate chain</h3>
              <ol>
                {verdict.chain.map((certificate) => (
                  <li key={certificate.fingerprint}>{certificateLine(certificate)}</li>
                ))}
              </ol>
            </div>
          )}
          {verdict && (canTrust(verdict) || verdict.trustedInClumsy) && fingerprint && (
            <p className="signature-trust-note">Trusting a signer only affects Clumsy on this computer. It doesn't change your system's certificate settings or what other apps show.</p>
          )}
          <div className="dialog-actions">
            <button type="button" className="button" onClick={() => signatures.viewSignedVersion(row.signature)}>
              View Signed Version
            </button>
            {fingerprint && canSignDigitally && (
              <button type="button" className="button" onClick={() => signatures.showCertificate(fingerprint)}>
                Show Certificate
              </button>
            )}
            {verdict && fingerprint && verdict.trustedInClumsy && (
              <button type="button" className="button" onClick={() => signatures.setTrusted(fingerprint, false)}>
                Stop Trusting in Clumsy
              </button>
            )}
            {verdict && fingerprint && canTrust(verdict) && (
              <button type="button" className="button" onClick={() => signatures.setTrusted(fingerprint, true)}>
                Trust Signer in Clumsy
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="button primary" autoFocus onClick={signatures.closeDetails}>
              Done
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
