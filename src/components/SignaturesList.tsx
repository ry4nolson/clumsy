import { PenLine } from "lucide-react";
import type { TabSignatures } from "../hooks/useTabSignatures";
import { CHANGED_AFTER, docMdpWords, kindLabel, signerName, statusWords, TRUSTED_NOTE, type SignatureRow } from "../lib/signatureStatus";
import { SignatureStatusIcon } from "./SignatureStatusIcon";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function formatTime(time: string) {
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? time : timeFormat.format(date);
}

export function signingTimeText(row: SignatureRow) {
  const time = row.verdict?.signingTime;
  if (time) {
    return time.source === "timestamp" ? `${formatTime(time.time)} (timestamped)` : `${formatTime(time.time)} (claimed)`;
  }
  return row.signature.claimedTime ? `${formatTime(row.signature.claimedTime)} (claimed)` : null;
}

function statusLabel(row: SignatureRow, loading: boolean) {
  if (!row.verdict) {
    return loading ? "Checking…" : statusWords.unknown.label;
  }
  return statusWords[row.verdict.status].label;
}

export function SignaturesList({ signatures, pageLabels }: { signatures: TabSignatures; pageLabels: string[] | null }) {
  const { rows, scan, loading, error } = signatures;
  const pageText = (page: number) => pageLabels?.[page - 1] ?? String(page);
  if (!scan) {
    return <p className="sidebar-empty">Checking signatures…</p>;
  }
  return (
    <div className="signatures-panel">
      {error && <p className="signatures-error">Couldn't check the signatures: {error}</p>}
      <ol className="changes signatures">
        {rows.map((row) => {
          const email = row.verdict?.signer?.email;
          const time = signingTimeText(row);
          return (
            <li key={row.signature.id}>
              <button type="button" className="change-row signature-row" onClick={() => signatures.reveal(row.signature)} onDoubleClick={() => signatures.openDetails(row)}>
                <span className="change-meta">
                  <SignatureStatusIcon status={row.verdict?.status ?? (loading ? null : "unknown")} size={14} />
                  <span>{statusLabel(row, loading)}</span>
                  {row.signature.page !== null && <span className="change-page">Page {pageText(row.signature.page)}</span>}
                </span>
                <span className="signature-signer">{signerName(row)}</span>
                {email && <span className="signature-detail">{email}</span>}
                {row.verdict?.signer && <span className="signature-detail">Issued by {row.verdict.signer.issuer}</span>}
                {time && <span className="signature-detail">{time}</span>}
                {row.signature.kind !== "approval" && <span className="signature-detail">{kindLabel(row.signature)}</span>}
                {row.signature.docMdp && <span className="signature-detail">{docMdpWords[row.signature.docMdp]}</span>}
                {row.verdict?.trustedInClumsy && <span className="signature-note">{TRUSTED_NOTE}</span>}
                {row.signature.modifiedAfter && <span className="signature-changed">{CHANGED_AFTER}</span>}
              </button>
              <button type="button" className="changes-more" onClick={() => signatures.openDetails(row)}>
                Details…
              </button>
            </li>
          );
        })}
        {scan.emptyFields.map((field) => (
          <li key={`field-${field.fieldName}`} className="signature-empty-field">
            <PenLine size={14} aria-hidden="true" />
            <span>
              Empty signature field “{field.fieldName}”, page {pageText(field.page)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
