import type { CompressProgress, CompressSettings } from "./compressPlan";
import { errorFrom, jobBuffers, type PageEditJob, type PageEditResponse, type PageEditResult } from "./pageEditMessages";
import type { Markup } from "./markup";
import type { StickyNote } from "./notes";
import type { PageEdit } from "./pageEditPlan";
import type { PrepareSignatureOptions, PreparedSignature, SignatureScan, ValidationMaterial } from "./signatureTypes";

const STOPPED = "The page edit stopped unexpectedly.";

type RunOptions = { onProgress?: (progress: CompressProgress) => void; signal?: AbortSignal };

export class WorkerStoppedError extends Error {}

export function runInWorker(spawn: () => Worker, job: PageEditJob, { onProgress, signal }: RunOptions = {}) {
  return new Promise<PageEditResult>((resolve, reject) => {
    const worker = spawn();
    signal?.addEventListener("abort", () => fail(new WorkerStoppedError()), { once: true });
    const fail = (error: Error) => {
      worker.terminate();
      reject(error);
    };
    worker.onmessage = (event: MessageEvent<PageEditResponse>) => {
      if ("progress" in event.data) {
        onProgress?.(event.data.progress);
        return;
      }
      worker.terminate();
      if ("result" in event.data) {
        resolve(event.data.result);
      } else {
        reject(errorFrom(event.data.failure));
      }
    };
    worker.onerror = (event) => fail(new Error(event.message || STOPPED));
    worker.onmessageerror = () => fail(new Error(STOPPED));
    try {
      worker.postMessage(job, jobBuffers(job));
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

const spawn = () => new Worker(new URL("../workers/pageEdit.worker.ts", import.meta.url), { type: "module" });

export async function applyPageEditOffThread(bytes: Uint8Array, edit: PageEdit, password?: string) {
  const result = await runInWorker(spawn, { op: "edit", bytes, edit, password });
  return { bytes: result.bytes, original: result.original ?? bytes, inserted: result.inserted ?? 0, unchanged: !!result.unchanged };
}

export const extractPagesOffThread = async (bytes: Uint8Array, pages: number[], password?: string) =>
  (await runInWorker(spawn, { op: "extract", bytes, pages, password })).bytes;

export const decryptPdfOffThread = async (bytes: Uint8Array, password?: string) => (await runInWorker(spawn, { op: "decrypt", bytes, password })).bytes;

export const encryptPdfOffThread = async (bytes: Uint8Array, password: string) => (await runInWorker(spawn, { op: "encrypt", bytes, password })).bytes;

const removedBy = new WeakMap<Uint8Array, number>();

export const signaturesRemovedBy = (bytes: Uint8Array) => removedBy.get(bytes) ?? 0;

export async function writeAnnotationsOffThread(bytes: Uint8Array, notes: StickyNote[], markup: Markup[], password?: string) {
  const result = await runInWorker(spawn, { op: "annotations", bytes, notes, markup, password });
  if (result.removedSignatures) {
    removedBy.set(result.bytes, result.removedSignatures);
  }
  return result.bytes;
}

export const readMarkupOffThread = async (bytes: Uint8Array, password?: string) => (await runInWorker(spawn, { op: "readMarkup", bytes, password })).markup ?? [];

export const passwordRoleOffThread = async (bytes: Uint8Array, password: string) => (await runInWorker(spawn, { op: "role", bytes, password })).role ?? null;

export const compressPdfOffThread = async (bytes: Uint8Array, settings: CompressSettings, password: string | undefined, options: RunOptions) =>
  (await runInWorker(spawn, { op: "compress", bytes, settings, password }, options)).bytes;

export const combinePdfsOffThread = async (files: Uint8Array[]) => (await runInWorker(spawn, { op: "combine", files })).bytes;

const EMPTY_SCAN: SignatureScan = { signatures: [], emptyFields: [], dss: null, encrypted: false, certified: null };

export const scanSignaturesOffThread = async (bytes: Uint8Array, password?: string): Promise<SignatureScan> =>
  (await runInWorker(spawn, { op: "scanSignatures", bytes, password })).scan ?? EMPTY_SCAN;

const preparedFrom = (result: PageEditResult): PreparedSignature => {
  if (!result.placeholder || result.fieldName === undefined) {
    throw new Error("The signature couldn't be prepared.");
  }
  return { bytes: result.bytes, placeholder: result.placeholder, fieldName: result.fieldName };
};

export const prepareSignatureOffThread = async (bytes: Uint8Array, options: PrepareSignatureOptions) =>
  preparedFrom(await runInWorker(spawn, { op: "prepareSignature", bytes, options }));

export const appendDssOffThread = async (bytes: Uint8Array, material: ValidationMaterial) => (await runInWorker(spawn, { op: "appendDss", bytes, material })).bytes;

export const prepareDocTimestampOffThread = async (bytes: Uint8Array) => preparedFrom(await runInWorker(spawn, { op: "prepareDocTimestamp", bytes }));
