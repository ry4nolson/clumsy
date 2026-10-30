import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { DefaultAppKind, DefaultAppStatus } from "./defaultApp";
import type { RecentEntry } from "./recent";
import { decodeText, encodeText, ensureMarkdownExtension, isMarkdownName, type TextFormat } from "./textFile";

export type PdfSource = {
  name: string;
  path: string | null;
  data: Uint8Array;
  stamp?: string | null;
};

export type MarkdownSource = {
  name: string;
  path: string | null;
  text: string;
  format: TextFormat;
  stamp?: string | null;
};

export type DocumentSource = PdfSource | MarkdownSource;

export const isMarkdownSource = (source: DocumentSource): source is MarkdownSource => "text" in source;

export const CHANGED_ON_DISK = "changed-on-disk";

export const NOT_WRITABLE = "not-writable";

export const isDesktop = isTauri();

export function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

export function ensurePdfExtension(name: string) {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

export async function fileStamp(path: string) {
  return invoke<string | null>("file_stamp", { path });
}

export async function readPdfFromPath(path: string): Promise<PdfSource> {
  const stamp = await fileStamp(path);
  const buffer = await invoke<ArrayBuffer>("read_pdf", { path });
  return { name: fileNameFromPath(path), path, data: new Uint8Array(buffer), stamp };
}

export async function readPdfFromFile(file: File): Promise<PdfSource> {
  return { name: file.name, path: null, data: new Uint8Array(await file.arrayBuffer()) };
}

export function markdownSource(name: string, path: string | null, bytes: Uint8Array, stamp?: string | null): MarkdownSource {
  return { name, path, stamp, ...decodeText(bytes) };
}

export async function readMarkdownFromPath(path: string): Promise<MarkdownSource> {
  const stamp = await fileStamp(path);
  const buffer = await invoke<ArrayBuffer>("read_markdown", { path });
  return markdownSource(fileNameFromPath(path), path, new Uint8Array(buffer), stamp);
}

export async function readMarkdownFromFile(file: File): Promise<MarkdownSource> {
  return markdownSource(file.name, null, new Uint8Array(await file.arrayBuffer()));
}

export function readDocumentFromPath(path: string): Promise<DocumentSource> {
  return isMarkdownName(path) ? readMarkdownFromPath(path) : readPdfFromPath(path);
}

export async function writeMarkdown(path: string, source: Pick<MarkdownSource, "text" | "format">, expectedStamp?: string | null) {
  const headers: Record<string, string> = { "x-path": encodeURIComponent(path) };
  if (expectedStamp) {
    headers["x-expected-stamp"] = expectedStamp;
  }
  return invoke<string>("write_markdown", encodeText(source.text, source.format), { headers });
}

export async function pickMarkdownSavePath(suggestedName: string) {
  return invoke<string | null>("pick_markdown_save_path", { suggestedName: ensureMarkdownExtension(suggestedName) });
}

export function downloadMarkdown(name: string, source: Pick<MarkdownSource, "text" | "format">) {
  const url = URL.createObjectURL(new Blob([encodeText(source.text, source.format) as BlobPart], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = ensureMarkdownExtension(name);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readLinkedImage(document: string, src: string) {
  return new Uint8Array(await invoke<ArrayBuffer>("read_linked_image", { document, src }));
}

export async function openLinkedFile(document: string, href: string) {
  return invoke<string>("open_linked_file", { document, href });
}

export function pickFilesInBrowser(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.click();
  });
}

async function pickFileInBrowser() {
  return (await pickFilesInBrowser("application/pdf,.pdf", false))[0] ?? null;
}

export async function pickPdf(): Promise<PdfSource | null> {
  if (!isDesktop) {
    const file = await pickFileInBrowser();
    return file ? readPdfFromFile(file) : null;
  }
  const selected = await invoke<string | null>("pick_pdf");
  return selected ? readPdfFromPath(selected) : null;
}

export async function pickDocument(): Promise<DocumentSource | null> {
  if (!isDesktop) {
    const file = (await pickFilesInBrowser("application/pdf,.pdf,text/markdown,.md,.markdown", false))[0];
    return !file ? null : isMarkdownName(file.name) ? readMarkdownFromFile(file) : readPdfFromFile(file);
  }
  const selected = await invoke<string | null>("pick_document");
  return selected ? readDocumentFromPath(selected) : null;
}

export async function pickPdfs(): Promise<Array<Promise<PdfSource>>> {
  if (!isDesktop) {
    return (await pickFilesInBrowser("application/pdf,.pdf", true)).map(readPdfFromFile);
  }
  return (await invoke<string[]>("pick_pdfs")).map(readPdfFromPath);
}

export type ContextMenuItem = { label: string; enabled?: boolean; run: () => void } | "-";

export async function showContextMenu(items: ContextMenuItem[]) {
  if (!isDesktop) {
    return false;
  }
  const entries = await Promise.all(
    items.map((item) =>
      item === "-" ? PredefinedMenuItem.new({ item: "Separator" }) : MenuItem.new({ text: item.label, enabled: item.enabled ?? true, action: item.run }),
    ),
  );
  await (await Menu.new({ items: entries })).popup();
  return true;
}

export async function writePdf(path: string, data: Uint8Array, expectedStamp?: string | null) {
  const headers: Record<string, string> = { "x-path": encodeURIComponent(path) };
  if (expectedStamp) {
    headers["x-expected-stamp"] = expectedStamp;
  }
  return invoke<string>("write_pdf", data, { headers });
}

export async function pickSavePath(suggestedName: string) {
  return invoke<string | null>("pick_save_path", { suggestedName: ensurePdfExtension(suggestedName) });
}

export async function confirmOverwrite(name: string) {
  const prompt = `“${name}” was changed by another app since you opened it. Saving will replace those changes.`;
  return ask(prompt, { title: "File changed on disk", kind: "warning", okLabel: "Save Anyway", cancelLabel: "Cancel" });
}

export function downloadPdf(name: string, data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = ensurePdfExtension(name);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function confirmDiscard(names: string[]) {
  const prompt =
    names.length === 1
      ? `“${names[0]}” has unsaved changes. Discard them?`
      : `${names.length} documents have unsaved changes (${names.join(", ")}). Discard them?`;
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
  await message(text, { title: "Clumsy", kind: "error" });
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

export const isMac = navigator.userAgent.includes("Mac");

export const hasOverlayTitlebar = isDesktop && isMac;

export async function onFullscreenChange(handler: (fullscreen: boolean) => void) {
  if (!isDesktop) {
    return () => {};
  }
  const window = getCurrentWindow();
  const sync = async () => handler(await window.isFullscreen());
  await sync();
  return window.onResized(sync);
}

export async function getDefaultAppStatus(kind: DefaultAppKind = "pdf"): Promise<DefaultAppStatus> {
  if (!isDesktop) {
    return { supported: false, isDefault: false, currentApp: null };
  }
  return invoke<DefaultAppStatus>("default_app_status", { kind });
}

export async function makeDefaultApp(kind: DefaultAppKind = "pdf") {
  return invoke<DefaultAppStatus>("make_default_app", { kind });
}

export async function getRecentFiles(): Promise<RecentEntry[] | null> {
  return isDesktop ? invoke<RecentEntry[]>("recent_files") : null;
}

export async function recordRecentFile(path: string) {
  if (isDesktop) {
    await invoke("record_recent_file", { path });
  }
}

export async function removeRecentFile(path: string) {
  await invoke("remove_recent_file", { path });
}

export async function clearRecentFiles() {
  await invoke("clear_recent_files");
}

export async function onRecentFilesChanged(handler: () => void) {
  if (!isDesktop) {
    return () => {};
  }
  return listen("recent-files-changed", handler);
}

export async function revealInFinder(path: string) {
  if (isDesktop) {
    await revealItemInDir(path);
  }
}

export async function reportDocuments(paths: string[], unsaved: string[]) {
  if (isDesktop) {
    await invoke("report_documents", { paths, unsaved });
  }
}

export async function documentWindowFor(path: string) {
  return isDesktop ? invoke<string | null>("document_window", { path }) : null;
}

export async function showDocumentInWindow(label: string, path: string) {
  await emitTo(label, "show-document", path);
  await (await WebviewWindow.getByLabel(label))?.setFocus();
}

export async function onShowDocument(handler: (path: string) => void) {
  if (!isDesktop) {
    return () => {};
  }
  return getCurrentWebview().listen<string>("show-document", ({ payload }) => handler(payload));
}

export async function requestQuit() {
  if (isDesktop) {
    await invoke("request_quit");
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
  const unlisten = await getCurrentWebview().listen("files-opened", drain);
  await drain();
  return unlisten;
}

export type DropPoint = { x: number; y: number };

export type DroppedFile = string | File;

export async function onFileDrop(handler: (files: DroppedFile[], point: DropPoint | null) => void, onHover: (point: DropPoint | null) => void) {
  if (isDesktop) {
    let last: DropPoint | null = null;
    return getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === "enter" || payload.type === "over") {
        last = { x: payload.position.x / window.devicePixelRatio, y: payload.position.y / window.devicePixelRatio };
        onHover(last);
        return;
      }
      onHover(null);
      if (payload.type === "drop" && payload.paths.length) {
        const point = { x: payload.position.x / window.devicePixelRatio, y: payload.position.y / window.devicePixelRatio };
        handler(payload.paths, point ?? last);
      }
    });
  }

  const over = (event: DragEvent) => {
    event.preventDefault();
    onHover({ x: event.clientX, y: event.clientY });
  };
  const leave = (event: DragEvent) => {
    if (!event.relatedTarget) {
      onHover(null);
    }
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    onHover(null);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) {
      handler(files, { x: event.clientX, y: event.clientY });
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

export async function closeWindow() {
  if (isDesktop) {
    await getCurrentWindow().close();
  }
}

export async function onCloseRequested(isDirty: () => boolean, documentNames: () => string[]) {
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
    if (isDirty() && !(await confirmDiscard(documentNames()))) {
      event.preventDefault();
    }
  });
}
