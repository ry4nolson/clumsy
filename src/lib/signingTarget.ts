import type { DocMdpPermission, EmptySignatureField, PrepareSignatureOptions, SignatureAppearance, SigningIdentity } from "./signatureTypes";

export type Rect = [number, number, number, number];

export type TargetChoice =
  | { kind: "field"; field: EmptySignatureField }
  | { kind: "corner"; page: number; rect: Rect }
  | { kind: "box"; page: number; rect: Rect }
  | { kind: "invisible"; page: number };

const MARGIN = 36;
const WIDTH = 180;
const HEIGHT = 54;
export const MIN_BOX = 12;

export function cornerRect(view: Rect, rotation: number): Rect {
  const [x0, y0, x1, y1] = view;
  const turned = ((rotation % 360) + 360) % 360;
  const across = turned === 90 || turned === 270 ? y1 - y0 : x1 - x0;
  const down = turned === 90 || turned === 270 ? x1 - x0 : y1 - y0;
  const margin = Math.min(MARGIN, across / 8, down / 8);
  const w = Math.max(0, Math.min(WIDTH, across - 2 * margin));
  const h = Math.max(0, Math.min(HEIGHT, down - 2 * margin));
  switch (turned) {
    case 90:
      return [x1 - margin - h, y1 - margin - w, x1 - margin, y1 - margin];
    case 180:
      return [x0 + margin, y1 - margin - h, x0 + margin + w, y1 - margin];
    case 270:
      return [x0 + margin, y0 + margin, x0 + margin + h, y0 + margin + w];
    default:
      return [x1 - margin - w, y0 + margin, x1 - margin, y0 + margin + h];
  }
}

export function normalizedBox([ax, ay, bx, by]: Rect): Rect | null {
  const box: Rect = [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
  return box[2] - box[0] >= MIN_BOX && box[3] - box[1] >= MIN_BOX ? box : null;
}

export function targetFor(choice: TargetChoice): PrepareSignatureOptions["target"] {
  switch (choice.kind) {
    case "field":
      return { kind: "field", fieldName: choice.field.fieldName };
    case "invisible":
      return { kind: "invisible", page: choice.page };
    default:
      return { kind: "new", page: choice.page, rect: choice.rect };
  }
}

export const isVisible = (choice: TargetChoice) => choice.kind !== "invisible";

const pad = (value: number) => String(Math.abs(value)).padStart(2, "0");

export function localIsoTime(date: Date) {
  const offset = -date.getTimezoneOffset();
  const zone = `${offset < 0 ? "-" : "+"}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${zone}`;
}

export function appearanceLines(signer: string, signingTime: string, reason: string | null, certify: DocMdpPermission | null) {
  const lines = [`${certify ? "Certified" : "Digitally signed"} by ${signer}`, `Date: ${signingTime.slice(0, 10)}`];
  return reason ? [...lines, `Reason: ${reason}`] : lines;
}

export type OutlinePreview = { viewBox: string; path: string; areContours: boolean };

export function outlineFrom(preview: OutlinePreview, thickness: number): SignatureAppearance["outline"] {
  const numbers = preview.viewBox.trim().split(/[\s,]+/).map(Number);
  if (numbers.length !== 4 || numbers.some((value) => !Number.isFinite(value)) || !preview.path) {
    return null;
  }
  return { path: preview.path, viewBox: numbers as Rect, areContours: preview.areContours, thickness };
}

export function preselectedIdentity(identities: SigningIdentity[], remembered: string | null) {
  const usable = identities.filter((identity) => identity.usable);
  return (usable.find((identity) => identity.fingerprint === remembered) ?? usable[0])?.fingerprint ?? null;
}

export const identityLabel = (identity: SigningIdentity) => `${identity.certificate.commonName} (${identity.certificate.issuer})`;

export function cleanTimestampUrl(text: string) {
  const trimmed = text.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}
