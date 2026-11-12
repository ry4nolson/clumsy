import { describe, expect, it } from "vitest";
import {
  applyTrust,
  barMessage,
  canTrust,
  parseTrustedSigners,
  signatureRows,
  signedVersionName,
  statusWords,
  withTrust,
  worstRow,
} from "../src/lib/signatureStatus";
import type { PdfSignature, SignatureScan, SignatureStatus, SignatureVerdict } from "../src/lib/signatureTypes";

const signature = (id: string, patch: Partial<PdfSignature> = {}): PdfSignature => ({
  id,
  fieldName: `Signature${id}`,
  kind: "approval",
  subFilter: "ETSI.CAdES.detached",
  byteRange: [0, 10, 20, 30],
  byteRangeOk: true,
  problems: [],
  revisionEnd: 50,
  coversWholeFile: true,
  modifiedAfter: false,
  laterRevisions: 0,
  docMdp: null,
  claimedTime: null,
  name: null,
  reason: null,
  location: null,
  contactInfo: null,
  page: 1,
  rect: [0, 0, 100, 40],
  ...patch,
});

const verdict = (id: string, status: SignatureStatus, patch: Partial<SignatureVerdict> = {}): SignatureVerdict => ({
  id,
  status,
  integrity: status === "invalid" ? "altered" : "intact",
  signer: { commonName: `Signer ${id}`, email: null, organization: null, issuer: "Test CA", serial: "01", notBefore: "", notAfter: "", fingerprint: `ab:cd:${id}` },
  chain: [],
  trusted: status === "valid",
  signingTime: null,
  revocation: "good",
  revocationSource: null,
  digestAlgorithm: "SHA-256",
  signatureAlgorithm: "RSA",
  level: "B-B",
  problems: [],
  ...patch,
});

const scanOf = (...signatures: PdfSignature[]): SignatureScan => ({ signatures, emptyFields: [], dss: null, encrypted: false, certified: null });

describe("statusWords", () => {
  it("words every status differently", () => {
    const sentences = Object.values(statusWords).map((words) => words.sentence);
    const labels = Object.values(statusWords).map((words) => words.label);
    expect(new Set(sentences).size).toBe(sentences.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("applyTrust", () => {
  const trusted = new Set(["ABCD1"]);

  it("turns an unverified signer the user trusts into valid, marked as Clumsy's trust", () => {
    const shown = applyTrust(verdict("1", "unverified"), trusted);
    expect(shown.status).toBe("valid");
    expect(shown.trustedInClumsy).toBe(true);
  });

  it("never overrides an invalid, revoked, or weak verdict", () => {
    for (const status of ["invalid", "revoked", "weak", "expired"] as const) {
      const shown = applyTrust(verdict("1", status), trusted);
      expect(shown.status, status).toBe(status);
      expect(shown.trustedInClumsy, status).toBe(false);
    }
  });

  it("leaves signers who aren't on the list alone", () => {
    expect(applyTrust(verdict("2", "unverified"), trusted).status).toBe("unverified");
  });

  it("doesn't trust a signature whose bytes were altered", () => {
    expect(applyTrust(verdict("1", "unverified", { integrity: "altered" }), trusted).status).toBe("unverified");
  });

  it("only offers trust for intact, unverified signatures", () => {
    expect(canTrust(verdict("1", "unverified"))).toBe(true);
    expect(canTrust(verdict("1", "invalid"))).toBe(false);
    expect(canTrust(verdict("1", "valid"))).toBe(false);
  });
});

describe("worstRow", () => {
  it("picks the most serious status", () => {
    const rows = signatureRows(scanOf(signature("1"), signature("2"), signature("3")), [verdict("1", "valid"), verdict("2", "unverified"), verdict("3", "invalid")], new Set());
    expect(worstRow(rows)?.signature.id).toBe("3");
  });

  it("prefers a changed document among equal statuses", () => {
    const rows = signatureRows(scanOf(signature("1"), signature("2", { coversWholeFile: false, modifiedAfter: true })), [verdict("1", "valid"), verdict("2", "valid")], new Set());
    expect(worstRow(rows)?.signature.id).toBe("2");
  });

  it("is null for an unsigned document", () => {
    expect(worstRow(signatureRows(null, [], new Set()))).toBeNull();
  });
});

describe("barMessage", () => {
  it("says who signed and that it's valid", () => {
    const rows = signatureRows(scanOf(signature("1")), [verdict("1", "valid")], new Set());
    expect(barMessage(rows, false)?.text).toBe("Signed by Signer 1. The signature is valid.");
  });

  it("calls a later change a change, not invalid", () => {
    const rows = signatureRows(scanOf(signature("1", { coversWholeFile: false, modifiedAfter: true, laterRevisions: 1 })), [verdict("1", "valid")], new Set());
    const message = barMessage(rows, false);
    expect(message?.status).toBe("valid");
    expect(message?.changed).toBe(true);
    expect(message?.text).toContain("changed since it was signed");
    expect(message?.text).not.toMatch(/invalid/i);
  });

  it("counts the other signatures and names certifications", () => {
    const rows = signatureRows(scanOf(signature("1", { kind: "certification" }), signature("2")), [verdict("1", "unverified"), verdict("2", "valid")], new Set());
    expect(barMessage(rows, false)?.text).toBe(`Certified by Signer 1 and 1 more. ${statusWords.unverified.sentence}`);
  });

  it("says it's checking until verdicts arrive", () => {
    const rows = signatureRows(scanOf(signature("1", { name: "Pat" })), [], new Set());
    expect(barMessage(rows, true)?.text).toBe("Signed by Pat. Checking the signature…");
  });
});

describe("trusted signers", () => {
  it("normalizes and dedupes fingerprints", () => {
    expect(parseTrustedSigners(JSON.stringify(["ab:cd", "ABCD", 3, ""]))).toEqual(["ABCD"]);
    expect(parseTrustedSigners("not json")).toEqual([]);
  });

  it("adds and removes a signer", () => {
    const added = withTrust([], "ab cd", true);
    expect(added).toEqual(["ABCD"]);
    expect(withTrust(added, "AB:CD", false)).toEqual([]);
  });
});

it("names the signed version", () => {
  expect(signedVersionName("Contract.pdf")).toBe("Contract (signed version).pdf");
});
