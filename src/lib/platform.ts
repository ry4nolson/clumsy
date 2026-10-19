import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

export type PdfSource = {
  name: string;
  path: string | null;
  data: Uint8Array;
};

export const isDesktop = isTauri();

export function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

export function ensurePdfExtension(name: string) {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

export async function readPdfFromPath(path: string): Promise<PdfSource> {
  const buffer = await invoke<ArrayBuffer>("read_pdf", { path });
  return { name: fileNameFromPath(path), path, data: new Uint8Array(buffer) };
}

export async function readPdfFromFile(file: File): Promise<PdfSource> {
  return { name: file.name, path: null, data: new Uint8Array(await file.arrayBuffer()) };
}

function pickFileInBrowser(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

export async function pickPdf(): Promise<PdfSource | null> {
  if (!isDesktop) {
    const file = await pickFileInBrowser();
    return file ? readPdfFromFile(file) : null;
  }
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return selected ? readPdfFromPath(selected) : null;
}

export async function writePdf(path: string, data: Uint8Array) {
  await invoke("write_pdf", data, { headers: { "x-path": encodeURIComponent(path) } });
}

export async function pickSavePath(suggestedName: string) {
  const path = await save({
    defaultPath: ensurePdfExtension(suggestedName),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return path ? ensurePdfExtension(path) : null;
}

export function downloadPdf(name: string, data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = ensurePdfExtension(name);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function confirmDiscard(name: string) {
  const prompt = `“${name}” has unsaved changes. Discard them?`;
  if (!isDesktop) {
    return window.confirm(prompt);
  }
  return ask(prompt, { title: "Unsaved changes", kind: "warning", okLabel: "Discard", cancelLabel: "Cancel" });
}

export async function showError(text: string) {
  if (!isDesktop) {
    window.alert(text);
    return;
  }
  await message(text, { title: "PDF Viewer", kind: "error" });
}

export async function setWindowTitle(title: string) {
  document.title = title;
  if (isDesktop) {
    await getCurrentWindow().setTitle(title);
  }
}

export async function openExternal(url: string) {
  if (isDesktop) {
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export async function onOpenedFiles(handler: (paths: string[]) => void) {
  if (!isDesktop) {
    return () => {};
  }
  const drain = async () => {
    const paths = await invoke<string[]>("take_pending_files");
    if (paths.length) {
      handler(paths);
    }
  };
  const unlisten = await listen("files-opened", drain);
  await drain();
  return unlisten;
}

export async function onFileDrop(handler: (source: Promise<PdfSource>) => void, onHover: (hovering: boolean) => void) {
  if (isDesktop) {
    return getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === "enter" || payload.type === "over") {
        onHover(true);
        return;
      }
      onHover(false);
      if (payload.type === "drop") {
        const path = payload.paths.find((candidate) => /\.pdf$/i.test(candidate));
        if (path) {
          handler(readPdfFromPath(path));
        }
      }
    });
  }

  const over = (event: DragEvent) => {
    event.preventDefault();
    onHover(true);
  };
  const leave = (event: DragEvent) => {
    if (!event.relatedTarget) {
      onHover(false);
    }
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    onHover(false);
    const file = Array.from(event.dataTransfer?.files ?? []).find(
      (candidate) => candidate.type === "application/pdf" || /\.pdf$/i.test(candidate.name),
    );
    if (file) {
      handler(readPdfFromFile(file));
    }
  };
  window.addEventListener("dragover", over);
  window.addEventListener("dragleave", leave);
  window.addEventListener("drop", drop);
  return () => {
    window.removeEventListener("dragover", over);
    window.removeEventListener("dragleave", leave);
    window.removeEventListener("drop", drop);
  };
}

export async function onCloseRequested(isDirty: () => boolean, documentName: () => string) {
  if (!isDesktop) {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirty()) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }
  return getCurrentWindow().onCloseRequested(async (event) => {
    if (isDirty() && !(await confirmDiscard(documentName()))) {
      event.preventDefault();
    }
  });
}
