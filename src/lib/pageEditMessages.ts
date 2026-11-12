import type { Markup } from "./markup";
import type { StickyNote } from "./notes";
import { PageEditError, type PageEdit } from "./pageEditPlan";
import type { PasswordRole } from "./pdfDecrypt";
import type { PrepareSignatureOptions, SignaturePlaceholder, SignatureScan, ValidationMaterial } from "./signatureTypes";

export type PageEditJob =
  | { op: "edit"; bytes: Uint8Array; edit: PageEdit; password?: string }
  | { op: "extract"; bytes: Uint8Array; pages: number[]; password?: string }
  | { op: "decrypt"; bytes: Uint8Array; password?: string }
  | { op: "encrypt"; bytes: Uint8Array; password: string }
  | { op: "annotations"; bytes: Uint8Array; notes: StickyNote[]; markup: Markup[]; password?: string }
  | { op: "readMarkup"; bytes: Uint8Array; password?: string }
  | { op: "role"; bytes: Uint8Array; password: string }
  | { op: "combine"; files: Uint8Array[] }
  | { op: "scanSignatures"; bytes: Uint8Array; password?: string }
  | { op: "prepareSignature"; bytes: Uint8Array; options: PrepareSignatureOptions }
  | { op: "appendDss"; bytes: Uint8Array; material: ValidationMaterial }
  | { op: "prepareDocTimestamp"; bytes: Uint8Array };

export type PageEditResult = {
  bytes: Uint8Array;
  original?: Uint8Array;
  inserted?: number;
  unchanged?: boolean;
  role?: PasswordRole | null;
  markup?: Markup[];
  scan?: SignatureScan;
  placeholder?: SignaturePlaceholder;
  fieldName?: string;
  removedSignatures?: number;
};

export type PageEditFailure = { message: string; pageEdit: boolean };

export type PageEditResponse = { result: PageEditResult } | { failure: PageEditFailure };

export const buffersOf = (arrays: Array<Uint8Array | undefined>) => [
  ...new Set(arrays.flatMap((array) => (array?.buffer instanceof ArrayBuffer ? [array.buffer] : []))),
];

export function jobBuffers(job: PageEditJob) {
  switch (job.op) {
    case "edit":
      return buffersOf([job.bytes, job.edit.kind === "insert" ? job.edit.data : undefined]);
    case "extract":
    case "decrypt":
    case "encrypt":
    case "annotations":
    case "readMarkup":
    case "role":
    case "scanSignatures":
    case "prepareSignature":
    case "prepareDocTimestamp":
      return buffersOf([job.bytes]);
    case "appendDss":
      return buffersOf([job.bytes, ...job.material.certs, ...job.material.ocsps, ...job.material.crls]);
    case "combine":
      return buffersOf(job.files);
  }
}

export const resultBuffers = (result: PageEditResult) =>
  buffersOf([result.bytes, result.original, ...(result.scan?.dss ? [...result.scan.dss.certs, ...result.scan.dss.ocsps, ...result.scan.dss.crls] : [])]);

export const failureOf = (error: unknown): PageEditFailure => ({
  message: error instanceof Error ? error.message : String(error),
  pageEdit: error instanceof PageEditError,
});

export const errorFrom = (failure: PageEditFailure) => (failure.pageEdit ? new PageEditError(failure.message) : new Error(failure.message));
