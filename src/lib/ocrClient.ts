import type { RecognizedWord } from "./ocr";
import type { OcrAnswer, OcrJob } from "../workers/ocr.worker";

const STOPPED = "Text recognition stopped unexpectedly.";

export class OcrStoppedError extends Error {}

export function createOcrClient(model: ArrayBuffer, signal: AbortSignal) {
  const worker = new Worker(new URL("../workers/ocr.worker.ts", import.meta.url), { type: "module" });
  let pending: { id: number; resolve: (words: RecognizedWord[]) => void; reject: (error: Error) => void } | null = null;
  let next = 0;
  let unsent: ArrayBuffer | undefined = model;
  const fail = (error: Error) => {
    worker.terminate();
    pending?.reject(error);
    pending = null;
  };
  signal.addEventListener("abort", () => fail(new OcrStoppedError()), { once: true });
  worker.onerror = (event) => fail(new Error(event.message || STOPPED));
  worker.onmessageerror = () => fail(new Error(STOPPED));
  worker.onmessage = ({ data }: MessageEvent<OcrAnswer>) => {
    if (data.id !== pending?.id) {
      return;
    }
    const { resolve, reject } = pending;
    pending = null;
    if ("failure" in data) {
      reject(new Error(data.failure));
    } else {
      resolve(data.words);
    }
  };
  return {
    recognize: (image: ImageData) =>
      new Promise<RecognizedWord[]>((resolve, reject) => {
        if (signal.aborted) {
          reject(new OcrStoppedError());
          return;
        }
        pending = { id: ++next, resolve, reject };
        const job: OcrJob = { id: next, image, model: unsent };
        worker.postMessage(job, unsent ? [image.data.buffer, unsent] : [image.data.buffer]);
        unsent = undefined;
      }),
    close: () => worker.terminate(),
  };
}
