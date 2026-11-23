import { ScanText, X } from "lucide-react";
import "./ScanHints.css";
import "./Signatures.css";

export function ScanBar({ onRecognize, onDismiss }: { onRecognize: () => void; onDismiss: () => void }) {
  return (
    <div className="signature-bar" role="status" aria-live="polite">
      <ScanText size={16} aria-hidden="true" />
      <span className="signature-bar-text">This document has no text to search or select. If it's a scan, Clumsy can read it.</span>
      <button type="button" className="button compact primary" onClick={onRecognize}>
        Recognize Text (OCR)…
      </button>
      <button type="button" className="icon-button" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
