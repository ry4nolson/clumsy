import { GlobalWorkerOptions, PasswordResponses, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

const assetsUrl = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;

export class PasswordCancelledError extends Error {}

export function loadPdf(data: Uint8Array, requestPassword: (incorrect: boolean) => Promise<string | null>) {
  const task = getDocument({
    data,
    cMapUrl: `${assetsUrl}cmaps/`,
    standardFontDataUrl: `${assetsUrl}standard_fonts/`,
    wasmUrl: `${assetsUrl}wasm/`,
    iccUrl: `${assetsUrl}iccs/`,
    enableXfa: false,
  });

  let cancelled = false;
  task.onPassword = async (update: (password: string) => void, reason: number) => {
    const password = await requestPassword(reason === PasswordResponses.INCORRECT_PASSWORD);
    if (password === null) {
      cancelled = true;
      await task.destroy();
      return;
    }
    update(password);
  };

  return task.promise.catch((error: unknown) => {
    throw cancelled ? new PasswordCancelledError() : error;
  });
}
