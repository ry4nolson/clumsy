import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

Promise.withResolvers ??= <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const buffers = ArrayBuffer.prototype as ArrayBuffer & { transferToFixedLength?: (length?: number) => ArrayBuffer };
buffers.transferToFixedLength ??= function (this: ArrayBuffer, length = this.byteLength) {
  const copy = new ArrayBuffer(length);
  new Uint8Array(copy).set(new Uint8Array(this, 0, Math.min(length, this.byteLength)));
  return copy;
};

const standardFontDataUrl = new URL("../node_modules/pdfjs-dist/standard_fonts/", import.meta.url).pathname;

export const openPdf = (bytes: Uint8Array, password?: string) =>
  getDocument({ data: bytes.slice(), password, standardFontDataUrl, isEvalSupported: false, verbosity: 0 }).promise;
