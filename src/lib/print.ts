import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CommandId } from "./commands";
import { uniqueSorted } from "./pageEditPlan";

export type PrintOps = {
  extract: (bytes: Uint8Array, pages: number[], password?: string) => Promise<Uint8Array>;
  decrypt: (bytes: Uint8Array, password?: string) => Promise<Uint8Array>;
};

export const printCommands = new Set<CommandId>(["print", "printSelectedPages"]);

export function pagesToPrint(id: CommandId, selected: number[], pageCount: number) {
  if (id !== "printSelectedPages") {
    return null;
  }
  const pages = uniqueSorted(selected).filter((page) => page >= 0 && page < pageCount);
  return pages.length && pages.length < pageCount ? pages : null;
}

export async function printableBytes(bytes: Uint8Array, pages: number[] | null, decryptWith: string | null, ops: PrintOps) {
  if (pages) {
    return ops.extract(bytes, pages, decryptWith ?? undefined);
  }
  return decryptWith === null ? bytes : ops.decrypt(bytes.slice(), decryptWith).catch(() => bytes);
}

export function oneAtATime<A extends unknown[], R>(task: (...args: A) => Promise<R>) {
  let last: Promise<unknown> = Promise.resolve();
  return (...args: A) => {
    const run = last.catch(() => undefined).then(() => task(...args));
    last = run;
    return run;
  };
}

export async function saveKeepingModified(doc: PDFDocumentProxy) {
  const storage = doc.annotationStorage;
  storage.resetModified = () => undefined;
  try {
    return await doc.saveDocument();
  } finally {
    Reflect.deleteProperty(storage, "resetModified");
  }
}
