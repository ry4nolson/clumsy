export type ByteRange = [number, number, number, number];

export type SignatureKind = "approval" | "certification" | "timestamp";

export type DocMdpPermission = 1 | 2 | 3;

export type PdfSignature = {
  id: string;
  fieldName: string;
  kind: SignatureKind;
  subFilter: string;
  byteRange: ByteRange;
  byteRangeOk: boolean;
  problems: string[];
  revisionEnd: number;
  coversWholeFile: boolean;
  laterRevisions: number;
  docMdp: DocMdpPermission | null;
  claimedTime: string | null;
  name: string | null;
  reason: string | null;
  location: string | null;
  contactInfo: string | null;
  page: number | null;
  rect: [number, number, number, number] | null;
};

export type EmptySignatureField = { fieldName: string; page: number; rect: [number, number, number, number] };

export type DssData = { certs: Uint8Array[]; ocsps: Uint8Array[]; crls: Uint8Array[] };

export type SignatureScan = {
  signatures: PdfSignature[];
  emptyFields: EmptySignatureField[];
  dss: DssData | null;
  encrypted: boolean;
  certified: DocMdpPermission | null;
};

export type SignatureStatus = "valid" | "invalid" | "unverified" | "expired" | "revoked" | "weak" | "unknown" | "unsupported";

export type CertificateSummary = {
  commonName: string;
  email: string | null;
  organization: string | null;
  issuer: string;
  serial: string;
  notBefore: string;
  notAfter: string;
  fingerprint: string;
};

export type PadesLevel = "B-B" | "B-T" | "B-LT" | "B-LTA";

export type SignatureVerdict = {
  id: string;
  status: SignatureStatus;
  integrity: "intact" | "altered" | "malformed";
  signer: CertificateSummary | null;
  chain: CertificateSummary[];
  trusted: boolean;
  signingTime: { time: string; source: "timestamp" | "claimed"; authority: string | null } | null;
  revocation: "good" | "revoked" | "unknown" | "not-checked";
  revocationSource: "embedded" | "online" | null;
  digestAlgorithm: string;
  signatureAlgorithm: string;
  level: PadesLevel | null;
  problems: string[];
};

export type VerifyItem = { id: string; byteRange: ByteRange; subFilter: string; claimedTime: string | null };

export type SigningIdentity = {
  fingerprint: string;
  certificate: CertificateSummary;
  keyType: "rsa" | "ec";
  keyBits: number;
  hardware: boolean;
  trusted: boolean;
  usable: boolean;
  problems: string[];
  warnings: string[];
};

export type SignaturePlaceholder = { byteRangeAt: number; byteRangeLength: number; contentsAt: number; contentsLength: number };

export const CONTENTS_HEX_LENGTH = 65536;

export type SignRequest = {
  placeholder: SignaturePlaceholder;
  identity: string;
  documentName: string;
  timestampUrl: string | null;
};

export type ValidationMaterial = {
  certs: Uint8Array[];
  ocsps: Uint8Array[];
  crls: Uint8Array[];
  vri: Record<string, { certs: number[]; ocsps: number[]; crls: number[] }>;
  problems: string[];
};

export type SignatureAppearance = {
  outline: { path: string; viewBox: [number, number, number, number]; areContours: boolean; thickness: number } | null;
  lines: string[];
};

export type PrepareSignatureOptions = {
  target: { kind: "field"; fieldName: string } | { kind: "new"; page: number; rect: [number, number, number, number] } | { kind: "invisible"; page: number };
  appearance: SignatureAppearance | null;
  certify: DocMdpPermission | null;
  lockField: boolean;
  signingTime: string;
  reason: string | null;
  location: string | null;
  name: string | null;
};

export type PreparedSignature = { bytes: Uint8Array; placeholder: SignaturePlaceholder; fieldName: string };

export const DEFAULT_TIMESTAMP_URL = "http://timestamp.digicert.com";

export const TIMESTAMP_SERVER_KEY = "clumsy.timestampServer";

export const SIGNING_IDENTITY_KEY = "clumsy.signingIdentity";

export const TRUSTED_SIGNERS_KEY = "clumsy.trustedSigners";
