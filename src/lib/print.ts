import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CommandId } from "./commands";
import { uniqueSorted } from "./pageEditPlan";
import type { PrintOutcome } from "./platform";

export type PrintOps = {
  extract: (bytes: Uint8Array, pages: number[], password?: string) => Promise<Uint8Array>;
  decrypt: (bytes: Uint8Array, password?: string) => Promise<Uint8Array>;
};

export type PrintSteps = PrintOps & {
  send: (bytes: Uint8Array) => Promise<PrintOutcome>;
  asImages: () => Promise<Uint8Array | null>;
};

export type PrintResult = PrintOutcome | "cancelled";

export const RASTER_TIERS = [
  { upTo: 50, dpi: 300 },
  { upTo: 200, dpi: 200 },
  { upTo: 500, dpi: 150 },
] as const;

export const RASTER_MIN_DPI = 100;

export const RASTER_QUALITY = 0.85;

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
  return decryptWith === null ? bytes : ops.decrypt(bytes, decryptWith);
}

export async function printWithFallback(saved: Uint8Array, pages: number[] | null, decryptWith: string | null, steps: PrintSteps): Promise<PrintResult> {
  const bytes = await printableBytes(saved, pages, decryptWith, steps).catch(() => null);
  const outcome = bytes ? await steps.send(bytes) : "unreadable";
  if (outcome !== "unreadable") {
    return outcome;
  }
  const images = await steps.asImages();
  return images ? steps.send(images) : "cancelled";
}

export function printJobName(name: string) {
  return name.replace(/\.(md|markdown)$/i, "") || name;
}

export function rasterDpi(pageCount: number) {
  return RASTER_TIERS.find((tier) => pageCount <= tier.upTo)?.dpi ?? RASTER_MIN_DPI;
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
