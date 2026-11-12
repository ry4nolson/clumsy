import type { DssData, SignatureVerdict, ValidationMaterial, VerifyItem } from "./signatureTypes";

type Span = [number, number];

type MaterialHeader = { certs: Span[]; ocsps: Span[]; crls: Span[]; vri: ValidationMaterial["vri"]; problems: string[] };

export const TIMESTAMP_FAILURE = "timestamp:";

export function isTimestampFailure(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).startsWith(TIMESTAMP_FAILURE);
}

export const signatureRequest = (request: unknown) => ({ headers: { "x-request": encodeURIComponent(JSON.stringify(request)) } });

export const emptyAsNull = (bytes: Uint8Array) => (bytes.length ? bytes : null);

export function verifyEnvelope(bytes: Uint8Array, items: VerifyItem[], dss: DssData | null) {
  const parts: Uint8Array[] = [];
  let size = 0;
  const span = (part: Uint8Array): Span => {
    parts.push(part);
    size += part.length;
    return [size - part.length, part.length];
  };
  const header = { items, pdf: span(bytes), dss: dss && { certs: dss.certs.map(span), ocsps: dss.ocsps.map(span), crls: dss.crls.map(span) } };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const body = new Uint8Array(4 + json.length + size);
  new DataView(body.buffer).setUint32(0, json.length, true);
  body.set(json, 4);
  let at = 4 + json.length;
  for (const part of parts) {
    body.set(part, at);
    at += part.length;
  }
  return body;
}

export function readValidationMaterial(body: Uint8Array): ValidationMaterial {
  const length = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(body.subarray(4, 4 + length))) as MaterialHeader;
  const payload = body.subarray(4 + length);
  const blobs = (spans: Span[]) => spans.map(([offset, size]) => payload.slice(offset, offset + size));
  return { certs: blobs(header.certs), ocsps: blobs(header.ocsps), crls: blobs(header.crls), vri: header.vri, problems: header.problems };
}

export function unsupportedVerdict(id: string): SignatureVerdict {
  return {
    id,
    status: "unsupported",
    integrity: "malformed",
    signer: null,
    chain: [],
    trusted: false,
    signingTime: null,
    revocation: "not-checked",
    revocationSource: null,
    digestAlgorithm: "",
    signatureAlgorithm: "",
    level: null,
    problems: ["Checking digital signatures needs the Clumsy app."],
  };
}

export const noValidationMaterial = (): ValidationMaterial => ({
  certs: [],
  ocsps: [],
  crls: [],
  vri: {},
  problems: ["Adding validation data needs the Clumsy app."],
});
