import type { StickyNote } from "./notes";
import { PageEditError, type PageEdit } from "./pageEditPlan";
import type { PasswordRole } from "./pdfDecrypt";

export type PageEditJob =
  | { op: "edit"; bytes: Uint8Array; edit: PageEdit; password?: string }
  | { op: "extract"; bytes: Uint8Array; pages: number[]; password?: string }
  | { op: "decrypt"; bytes: Uint8Array; password?: string }
  | { op: "encrypt"; bytes: Uint8Array; password: string }
  | { op: "notes"; bytes: Uint8Array; notes: StickyNote[]; password?: string }
  | { op: "role"; bytes: Uint8Array; password: string }
  | { op: "combine"; files: Uint8Array[] };

export type PageEditResult = { bytes: Uint8Array; original?: Uint8Array; inserted?: number; unchanged?: boolean; role?: PasswordRole | null };

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
    case "notes":
    case "role":
      return buffersOf([job.bytes]);
    case "combine":
      return buffersOf(job.files);
  }
}

export const failureOf = (error: unknown): PageEditFailure => ({
  message: error instanceof Error ? error.message : String(error),
  pageEdit: error instanceof PageEditError,
});

export const errorFrom = (failure: PageEditFailure) => (failure.pageEdit ? new PageEditError(failure.message) : new Error(failure.message));
