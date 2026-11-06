import { errorFrom, jobBuffers, type PageEditJob, type PageEditResponse, type PageEditResult } from "./pageEditMessages";
import type { PageEdit } from "./pageEditPlan";

const STOPPED = "The page edit stopped unexpectedly.";

export function runInWorker(spawn: () => Worker, job: PageEditJob) {
  return new Promise<PageEditResult>((resolve, reject) => {
    const worker = spawn();
    const fail = (error: Error) => {
      worker.terminate();
      reject(error);
    };
    worker.onmessage = (event: MessageEvent<PageEditResponse>) => {
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

export async function applyPageEditOffThread(bytes: Uint8Array, edit: PageEdit) {
  const result = await runInWorker(spawn, { op: "edit", bytes, edit });
  return { bytes: result.bytes, original: result.original ?? bytes, inserted: result.inserted ?? 0 };
}

export const extractPagesOffThread = async (bytes: Uint8Array, pages: number[], password?: string) =>
  (await runInWorker(spawn, { op: "extract", bytes, pages, password })).bytes;

export const decryptPdfOffThread = async (bytes: Uint8Array, password?: string) => (await runInWorker(spawn, { op: "decrypt", bytes, password })).bytes;

export const combinePdfsOffThread = async (files: Uint8Array[]) => (await runInWorker(spawn, { op: "combine", files })).bytes;
