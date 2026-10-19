import { invoke, isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { WebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { DefaultAppStatus } from "./defaultApp";
import type { RecentEntry } from "./recent";
import { placeOverWindow } from "./windowPlacement";

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

export const hasOverlayTitlebar = isDesktop && navigator.userAgent.includes("Mac");

export async function onFullscreenChange(handler: (fullscreen: boolean) => void) {
  if (!isDesktop) {
    return () => {};
  }
  const window = getCurrentWindow();
  const sync = async () => handler(await window.isFullscreen());
  await sync();
  return window.onResized(sync);
}

export async function getDefaultAppStatus(): Promise<DefaultAppStatus> {
  if (!isDesktop) {
    return { supported: false, isDefault: false, currentApp: null };
  }
  return invoke<DefaultAppStatus>("default_pdf_app");
}

export async function makeDefaultApp() {
  return invoke<DefaultAppStatus>("make_default_pdf_app");
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

const imageTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function pickImageInBrowser(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = Object.values(imageTypes).join(",");
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

export async function pickImage(): Promise<File | null> {
  if (!isDesktop) {
    return pickImageInBrowser();
  }
  const path = await open({ multiple: false, directory: false, filters: [{ name: "Images", extensions: Object.keys(imageTypes) }] });
  if (!path) {
    return null;
  }
  const buffer = await invoke<ArrayBuffer>("read_pdf", { path });
  const name = fileNameFromPath(path);
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return new File([buffer], name, { type: imageTypes[extension] ?? "application/octet-stream" });
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
        payload.paths.filter((candidate) => /\.pdf$/i.test(candidate)).forEach((path) => handler(readPdfFromPath(path)));
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
    Array.from(event.dataTransfer?.files ?? [])
      .filter((candidate) => candidate.type === "application/pdf" || /\.pdf$/i.test(candidate.name))
      .forEach((file) => handler(readPdfFromFile(file)));
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

export type AuxWindowKind = "about" | "shortcuts";
export type AuxWindowParams = Record<string, string>;

const auxWindows: Record<AuxWindowKind, { title: string; width: number; height: number; minWidth: number; minHeight: number }> = {
  about: { title: "About Clumsy", width: 560, height: 680, minWidth: 460, minHeight: 520 },
  shortcuts: { title: "Keyboard Shortcuts", width: 780, height: 660, minWidth: 420, minHeight: 360 },
};

export function currentWindowKind(): AuxWindowKind | null {
  const kind = new URLSearchParams(window.location.search).get("window");
  return kind === "about" || kind === "shortcuts" ? kind : null;
}

export function initialWindowParams(): AuxWindowParams {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

export async function openAuxWindow(kind: AuxWindowKind, params: AuxWindowParams = {}) {
  const query = new URLSearchParams({ window: kind, ...params }).toString();
  if (!isDesktop) {
    window.open(`?${query}`, `clumsy-${kind}`);
    return;
  }
  const existing = await WebviewWindow.getByLabel(kind);
  if (existing) {
    await existing.unminimize();
    await existing.show();
    await existing.setFocus();
    await emitTo(kind, "aux-window-params", params);
    return;
  }
  const options = auxWindows[kind];
  const placement = await placementOverMainWindow(options);
  new WebviewWindow(kind, {
    url: `index.html?${query}`,
    ...options,
    ...(placement ?? { center: true }),
    maximizable: false,
  });
}

async function placementOverMainWindow(size: { width: number; height: number }) {
  const main = getCurrentWindow();
  const [monitor, position, outerSize, scale] = await Promise.all([currentMonitor(), main.outerPosition(), main.outerSize(), main.scaleFactor()]);
  if (!monitor) {
    return null;
  }
  const owner = { x: position.x / scale, y: position.y / scale, width: outerSize.width / scale, height: outerSize.height / scale };
  const { workArea, scaleFactor } = monitor;
  const screen = {
    x: workArea.position.x / scaleFactor,
    y: workArea.position.y / scaleFactor,
    width: workArea.size.width / scaleFactor,
    height: workArea.size.height / scaleFactor,
  };
  return placeOverWindow(owner, screen, size);
}

export async function onAuxWindowParams(handler: (params: AuxWindowParams) => void) {
  if (!isDesktop) {
    return () => {};
  }
  return getCurrentWebview().listen<AuxWindowParams>("aux-window-params", ({ payload }) => handler(payload));
}

export async function closeFocusedAuxWindow() {
  if (!isDesktop) {
    return false;
  }
  for (const auxWindow of await getAllWebviewWindows()) {
    if (auxWindow.label !== "main" && (await auxWindow.isFocused())) {
      await auxWindow.close();
      return true;
    }
  }
  return false;
}

async function closeAuxWindows() {
  for (const auxWindow of await getAllWebviewWindows()) {
    if (auxWindow.label !== "main") {
      await auxWindow.close();
    }
  }
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
      return;
    }
    await closeAuxWindows();
  });
}
