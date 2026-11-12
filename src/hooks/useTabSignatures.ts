import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { PdfViewerApi } from "./usePdfViewer";
import { useDocumentSignatures } from "./useDocumentSignatures";
import { passwordOf } from "../lib/pdfjs";
import { showCertificate, showError, type PdfSource } from "../lib/platform";
import { barMessage, readTrustedSigners, signatureRows, signedVersionName, withTrust, writeTrustedSigners, type SignatureRow } from "../lib/signatureStatus";
import { TRUSTED_SIGNERS_KEY, type PdfSignature } from "../lib/signatureTypes";

const listeners = new Set<() => void>();
let trustedSnapshot: ReadonlySet<string> = new Set(readTrustedSigners());

const reloadTrusted = () => {
  trustedSnapshot = new Set(readTrustedSigners());
  listeners.forEach((listener) => listener());
};

function subscribeTrusted(listener: () => void) {
  if (!listeners.size) {
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === TRUSTED_SIGNERS_KEY) {
    reloadTrusted();
  }
}

export function setSignerTrusted(fingerprint: string, trusted: boolean) {
  writeTrustedSigners(withTrust(readTrustedSigners(), fingerprint, trusted));
  reloadTrusted();
}

export function useTabSignatures(viewer: PdfViewerApi, name: string, active: boolean, onOpenSource: (source: PdfSource) => void) {
  const doc = viewer.pdfDocument;
  const password = useMemo(() => (doc ? passwordOf(doc) : undefined), [doc]);
  const { scan, verdicts, loading, error } = useDocumentSignatures(doc, password);
  const trusted = useSyncExternalStore(subscribeTrusted, () => trustedSnapshot);
  const rows = useMemo(() => signatureRows(scan, verdicts, trusted), [scan, verdicts, trusted]);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setDetailsId(null);
    }
  }, [active]);

  const reveal = useCallback(
    (signature: PdfSignature) => {
      if (signature.page === null) {
        return;
      }
      if (signature.rect) {
        viewer.goToDestination([signature.page - 1, { name: "XYZ" }, signature.rect[0], signature.rect[3], null]);
      } else {
        viewer.goToPage(signature.page, true);
      }
    },
    [viewer],
  );

  const viewSignedVersion = useCallback(
    async (signature: PdfSignature) => {
      setDetailsId(null);
      try {
        const data = await doc?.getData();
        if (data) {
          onOpenSource({ name: signedVersionName(name), path: null, data: data.slice(0, signature.revisionEnd) });
        }
      } catch (reason) {
        await showError(`Couldn't open the signed version.\n\n${reason instanceof Error ? reason.message : String(reason)}`);
      }
    },
    [doc, name, onOpenSource],
  );

  const details: SignatureRow | null = rows.find((row) => row.signature.id === detailsId) ?? null;
  const hasPanel = !!scan && (scan.signatures.length > 0 || scan.emptyFields.length > 0);

  return {
    scan,
    rows,
    loading,
    error,
    hasPanel,
    bar: barMessage(rows, loading),
    details,
    openDetails: (row: SignatureRow) => setDetailsId(row.signature.id),
    closeDetails: () => setDetailsId(null),
    reveal,
    viewSignedVersion,
    showCertificate: (fingerprint: string) => showCertificate(fingerprint).catch((reason: unknown) => showError(`Couldn't show the certificate.\n\n${String(reason)}`)),
    setTrusted: setSignerTrusted,
  };
}

export type TabSignatures = ReturnType<typeof useTabSignatures>;
