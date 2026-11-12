import { useCallback, useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { scanSignaturesOffThread } from "../lib/pageEditWorker";
import { verifySignatures } from "../lib/platform";
import { mayHaveSignatures, mergeVerdicts, verifyItemsOf } from "../lib/signatureBytes";
import type { SignatureScan, SignatureVerdict } from "../lib/signatureTypes";

type SignatureState = { scan: SignatureScan | null; verdicts: SignatureVerdict[]; loading: boolean; error: string | null };

const IDLE: SignatureState = { scan: null, verdicts: [], loading: false, error: null };

const UNSIGNED: SignatureScan = { signatures: [], emptyFields: [], dss: null, encrypted: false, certified: null };

const hasSignatureField = (fields: Map<string, object[]> | null | undefined) =>
  fields === undefined || [...(fields?.values() ?? [])].some((widgets) => widgets.some((widget) => (widget as { type?: string }).type === "signature"));

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function useDocumentSignatures(pdfDocument: PDFDocumentProxy | null, password: string | undefined) {
  const [state, setState] = useState<SignatureState>(IDLE);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback(() => setGeneration((value) => value + 1), []);

  useEffect(() => {
    if (!pdfDocument) {
      setState(IDLE);
      return;
    }
    let current = true;
    const apply = (next: SignatureState) => {
      if (current) {
        setState(next);
      }
    };
    setState({ ...IDLE, loading: true });
    (async () => {
      let scan: SignatureScan | null = null;
      try {
        const fields = await pdfDocument.getFieldObjects().catch(() => undefined);
        const data = fields === null ? null : await pdfDocument.getData();
        scan = data && (hasSignatureField(fields) || mayHaveSignatures(data)) ? await scanSignaturesOffThread(data.slice(), password) : UNSIGNED;
        const items = verifyItemsOf(scan);
        apply({ scan, verdicts: mergeVerdicts(scan, []), loading: items.length > 0, error: null });
        if (!data || !items.length || !current) {
          return;
        }
        const verified = await verifySignatures(data, items, scan.dss);
        apply({ scan, verdicts: mergeVerdicts(scan, verified), loading: false, error: null });
      } catch (error) {
        apply({ scan, verdicts: scan ? mergeVerdicts(scan, []) : [], loading: false, error: messageOf(error) });
      }
    })();
    return () => {
      current = false;
    };
  }, [pdfDocument, password, generation]);

  return { ...state, refresh };
}
