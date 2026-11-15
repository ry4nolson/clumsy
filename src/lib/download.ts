import type { MarkdownSource } from "./platform";
import { encodeText, ensureMarkdownExtension } from "./textFile";

function download(name: string, data: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPdf(name: string, data: Uint8Array) {
  download(/\.pdf$/i.test(name) ? name : `${name}.pdf`, data, "application/pdf");
}

export function downloadMarkdown(name: string, source: Pick<MarkdownSource, "text" | "format">) {
  download(ensureMarkdownExtension(name), encodeText(source.text, source.format), "text/markdown");
}
