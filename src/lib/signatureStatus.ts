import { TRUSTED_SIGNERS_KEY, type DocMdpPermission, type PdfSignature, type SignatureScan, type SignatureStatus, type SignatureVerdict } from "./signatureTypes";

export type ShownVerdict = SignatureVerdict & { trustedInClumsy: boolean };

export type Tone = "good" | "warning" | "bad" | "neutral";

export type StatusWords = { label: string; sentence: string; tone: Tone };

export const statusWords: Record<SignatureStatus, StatusWords> = {
  valid: { label: "Valid", sentence: "The signature is valid.", tone: "good" },
  invalid: { label: "Invalid", sentence: "The signature is invalid: what was signed doesn't match the document.", tone: "bad" },
  revoked: { label: "Certificate revoked", sentence: "The signer's certificate has been revoked.", tone: "bad" },
  expired: { label: "Certificate expired", sentence: "The signer's certificate had expired when it was used.", tone: "warning" },
  weak: { label: "Weak signature", sentence: "The signature uses an outdated algorithm and can't be relied on.", tone: "warning" },
  unverified: { label: "Signer not verified", sentence: "The signature is intact, but the signer's certificate can't be verified.", tone: "warning" },
  unknown: { label: "Couldn't check", sentence: "The signature couldn't be checked.", tone: "neutral" },
  unsupported: { label: "Not checked", sentence: "Signatures can't be checked here.", tone: "neutral" },
};

const severity: SignatureStatus[] = ["invalid", "revoked", "weak", "expired", "unverified", "unknown", "unsupported", "valid"];

export const statusRank = (status: SignatureStatus) => severity.indexOf(status);

export const CHANGED_AFTER = "The document has been changed since it was signed.";

export const TRUSTED_NOTE = "Trusted in Clumsy";

export function changedAfter(signature: PdfSignature) {
  return signature.modifiedAfter;
}

export function applyTrust(verdict: SignatureVerdict, trusted: ReadonlySet<string>): ShownVerdict {
  const fingerprint = verdict.signer?.fingerprint;
  const trustable = verdict.status === "unverified" && verdict.integrity === "intact" && !!fingerprint && trusted.has(normalizeFingerprint(fingerprint));
  return trustable ? { ...verdict, status: "valid", trustedInClumsy: true } : { ...verdict, trustedInClumsy: false };
}

export const canTrust = (verdict: SignatureVerdict) => verdict.status === "unverified" && verdict.integrity === "intact" && !!verdict.signer;

export type SignatureRow = { signature: PdfSignature; verdict: ShownVerdict | null };

export function signatureRows(scan: SignatureScan | null, verdicts: SignatureVerdict[], trusted: ReadonlySet<string>): SignatureRow[] {
  const byId = new Map(verdicts.map((verdict) => [verdict.id, verdict]));
  return (scan?.signatures ?? []).map((signature) => {
    const verdict = byId.get(signature.id);
    return { signature, verdict: verdict ? applyTrust(verdict, trusted) : null };
  });
}

export function worstRow(rows: SignatureRow[]): SignatureRow | null {
  let worst: SignatureRow | null = null;
  const rank = (row: SignatureRow) => (row.verdict ? statusRank(row.verdict.status) : severity.length) * 2 + (changedAfter(row.signature) ? 0 : 1);
  for (const row of rows) {
    if (!worst || rank(row) < rank(worst)) {
      worst = row;
    }
  }
  return worst;
}

export function signerName(row: SignatureRow) {
  return row.verdict?.signer?.commonName || row.signature.name || "an unknown signer";
}

const kindVerb = (row: SignatureRow) => (row.signature.kind === "certification" ? "Certified" : row.signature.kind === "timestamp" ? "Timestamped" : "Signed");

export function barMessage(rows: SignatureRow[], checking: boolean) {
  const worst = worstRow(rows);
  if (!worst) {
    return null;
  }
  const others = rows.length > 1 ? ` and ${rows.length - 1} more` : "";
  const who = `${kindVerb(worst)} by ${signerName(worst)}${others}.`;
  if (!worst.verdict) {
    return { text: `${who} ${checking ? "Checking the signature…" : statusWords.unknown.sentence}`, status: "unknown" as SignatureStatus, changed: changedAfter(worst.signature) };
  }
  const changed = changedAfter(worst.signature);
  const status = worst.verdict.status;
  const sentence = status === "valid" && changed ? `The signature is valid, but the document has been changed since it was signed.` : statusWords[status].sentence;
  return { text: `${who} ${sentence}`, status, changed };
}

export const docMdpWords: Record<DocMdpPermission, string> = {
  1: "No changes are allowed.",
  2: "Filling in forms and signing are allowed.",
  3: "Filling in forms, signing, and comments are allowed.",
};

export const kindLabel = (signature: PdfSignature) =>
  signature.kind === "certification" ? "Certification signature" : signature.kind === "timestamp" ? "Document timestamp" : "Signature";

export const normalizeFingerprint = (fingerprint: string) => fingerprint.replace(/[^0-9a-f]/gi, "").toUpperCase();

export function parseTrustedSigners(text: string | null): string[] {
  if (!text) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? [...new Set(parsed.filter((entry): entry is string => typeof entry === "string").map(normalizeFingerprint).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

export function withTrust(list: string[], fingerprint: string, trusted: boolean) {
  const key = normalizeFingerprint(fingerprint);
  const rest = list.filter((entry) => entry !== key);
  return trusted ? [...rest, key] : rest;
}

export function readTrustedSigners(storage: Pick<Storage, "getItem"> = localStorage) {
  try {
    return parseTrustedSigners(storage.getItem(TRUSTED_SIGNERS_KEY));
  } catch {
    return [];
  }
}

export function writeTrustedSigners(list: string[], storage: Pick<Storage, "setItem"> = localStorage) {
  try {
    storage.setItem(TRUSTED_SIGNERS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const signedVersionName = (name: string) => `${name.replace(/\.pdf$/i, "")} (signed version).pdf`;
