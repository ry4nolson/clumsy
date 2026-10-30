import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow, getAllWebviewWindows, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { isDesktop, markdownSource, readDocumentFromPath, type DocumentSource } from "./platform";
import type { NavHistory } from "./navHistory";
import type { AnyViewState } from "./tabs";
import type { ScrollModeName, SpreadModeName } from "./viewModes";

export type ViewState = {
  page: number;
  scaleValue: string;
  left: number | null;
  top: number | null;
  rotation: number;
  scrollMode?: ScrollModeName;
  spreadMode?: SpreadModeName;
  history?: NavHistory;
};

export type TabTransfer =
  | { kind: "start" }
  | {
      kind: "document";
      format?: "markdown";
      transferId?: string;
      name: string;
      path: string | null;
      stamp: string | null;
      modified: boolean;
      view?: AnyViewState;
    };

export type Rect = { x: number; y: number; width: number; height: number };

export type SessionPane = { size: number; active: number; tabs: TabTransfer[] };

export type SessionWindow = { panes: SessionPane[]; focusedPane: number; bounds?: Rect; focused?: boolean };

const CASCADE = 28;

export function currentWindowLabel() {
  return isDesktop ? getCurrentWindow().label : "main";
}

export function isMainWindow() {
  return currentWindowLabel() === "main";
}

export async function stashTransferBytes(bytes: Uint8Array) {
  return invoke<string>("stash_transfer", bytes);
}

export async function takeTransferBytes(id: string) {
  return new Uint8Array(await invoke<ArrayBuffer>("take_transfer", { id }));
}

export async function transferSource(transfer: Extract<TabTransfer, { kind: "document" }>): Promise<DocumentSource> {
  if (!transfer.transferId) {
    if (!transfer.path) {
      throw new Error("The document is no longer available");
    }
    return readDocumentFromPath(transfer.path);
  }
  const data = await takeTransferBytes(transfer.transferId);
  return transfer.format === "markdown"
    ? markdownSource(transfer.name, transfer.path, data, transfer.stamp)
    : { name: transfer.name, path: transfer.path, data, stamp: transfer.stamp };
}

export function initialRestoreIndex() {
  const raw = new URLSearchParams(window.location.search).get("restore");
  const index = raw === null ? NaN : Number(raw);
  return Number.isInteger(index) && index > 0 ? index : null;
}

export async function requestRestart() {
  if (isDesktop) {
    await invoke("request_restart");
  }
}

export async function reportSession(session: SessionWindow | null) {
  await invoke("report_session", { session });
}

export async function onCaptureSession(handler: () => void) {
  if (!isDesktop) {
    return () => {};
  }
  return getCurrentWebviewWindow().listen("capture-session", handler);
}

export async function restoredWindowCount() {
  return isDesktop ? invoke<number>("restored_windows") : 0;
}

export async function takeRestoredWindow(index: number) {
  return invoke<SessionWindow | null>("take_restored_window", { index });
}

export async function currentWindowBounds() {
  return isDesktop ? logicalRect(getCurrentWindow()) : undefined;
}

export async function restoreWindowBounds(bounds: Rect, focused: boolean) {
  if (!isDesktop) {
    return;
  }
  const current = getCurrentWindow();
  await current.setPosition(new LogicalPosition(bounds.x, bounds.y));
  await current.setSize(new LogicalSize(bounds.width, bounds.height));
  if (focused) {
    await current.setFocus();
  }
}

export function initialTransfer(): TabTransfer | null {
  const raw = new URLSearchParams(window.location.search).get("transfer");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as TabTransfer;
  } catch {
    return null;
  }
}

async function logicalRect(target: Window): Promise<Rect> {
  const [position, size, scale] = await Promise.all([target.outerPosition(), target.outerSize(), target.scaleFactor()]);
  return { x: position.x / scale, y: position.y / scale, width: size.width / scale, height: size.height / scale };
}

async function otherDocumentWindows() {
  const current = currentWindowLabel();
  return (await getAllWebviewWindows()).filter((candidate) => candidate.label !== current && (candidate.label === "main" || candidate.label.startsWith("doc-")));
}

export async function hasOtherDocumentWindows() {
  return isDesktop && (await otherDocumentWindows()).length > 0;
}

export async function documentWindowAt(screenX: number, screenY: number) {
  if (!isDesktop) {
    return null;
  }
  for (const candidate of await otherDocumentWindows()) {
    if (!(await candidate.isVisible()) || (await candidate.isMinimized())) {
      continue;
    }
    const rect = await logicalRect(candidate);
    if (screenX >= rect.x && screenX <= rect.x + rect.width && screenY >= rect.y && screenY <= rect.y + rect.height) {
      return candidate.label;
    }
  }
  return null;
}

export async function openDocumentWindow(transfer: TabTransfer | null, at?: { x: number; y: number }, restore?: number) {
  if (!isDesktop) {
    return;
  }
  const current = getCurrentWindow();
  const rect = await logicalRect(current);
  const label = `doc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const query = new URLSearchParams({
    window: "document",
    ...(transfer ? { transfer: JSON.stringify(transfer) } : {}),
    ...(restore ? { restore: String(restore) } : {}),
  });
  new WebviewWindow(label, {
    url: `index.html?${query}`,
    title: "Clumsy",
    width: rect.width,
    height: rect.height,
    x: at ? at.x : rect.x + CASCADE,
    y: at ? at.y : rect.y + CASCADE,
    minWidth: 640,
    minHeight: 420,
    titleBarStyle: "overlay",
    hiddenTitle: true,
    trafficLightPosition: new LogicalPosition(16, 17),
  });
}

export async function sendTabToWindow(label: string, transfer: TabTransfer) {
  await emitTo(label, "receive-tab", transfer);
  await (await WebviewWindow.getByLabel(label))?.setFocus();
}

export async function onReceiveTab(handler: (transfer: TabTransfer) => void) {
  if (!isDesktop) {
    return () => {};
  }
  return getCurrentWebviewWindow().listen<TabTransfer>("receive-tab", ({ payload }) => handler(payload));
}

export async function onWindowFocused(handler: () => void) {
  if (!isDesktop) {
    return () => {};
  }
  return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) {
      handler();
    }
  });
}
