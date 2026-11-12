import type { TabSignatures } from "../hooks/useTabSignatures";
import { worstRow } from "../lib/signatureStatus";
import { SignatureStatusIcon } from "./SignatureStatusIcon";
import "./Signatures.css";

export function SignatureBar({ signatures }: { signatures: TabSignatures }) {
  const { bar, rows } = signatures;
  const worst = worstRow(rows);
  if (!bar || !worst) {
    return null;
  }
  const status = worst.verdict ? bar.status : signatures.loading ? null : "unknown";
  return (
    <div className="signature-bar" role="status" aria-live="polite">
      <SignatureStatusIcon status={status} />
      <span className="signature-bar-text" title={bar.text}>
        {bar.text}
      </span>
      {worst.verdict?.trustedInClumsy && <span className="signature-note">Trusted in Clumsy</span>}
      <button type="button" className="button compact" onClick={() => signatures.openDetails(worst)}>
        Details
      </button>
    </div>
  );
}
