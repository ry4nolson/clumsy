import type { DiffRequest, Segment } from "./textDiff";

export function diffInWorker(request: DiffRequest, signal: AbortSignal) {
  return new Promise<Segment[]>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/diff.worker.ts", import.meta.url), { type: "module" });
    signal.addEventListener(
      "abort",
      () => {
        worker.terminate();
        reject(signal.reason);
      },
      { once: true },
    );
    worker.onmessage = (event: MessageEvent<Segment[]>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The comparison stopped unexpectedly."));
    };
    worker.postMessage(request);
  });
}
