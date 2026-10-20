import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { emitTo } from "@tauri-apps/api/event";
import { WebviewWindow, getAllWebviewWindows, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { isDesktop } from "./platform";
import type { Rect } from "./windowPlacement";

export type ViewState = { page: number; scaleValue: string; left: number; top: number; rotation: number };

export type TabTransfer =
  | { kind: "start" }
  | { kind: "document"; transferId: string; name: string; path: string | null; modified: boolean; view?: ViewState };

const auxiliaryWindows = new Set(["about", "shortcuts"]);
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
  return (await getAllWebviewWindows()).filter((candidate) => candidate.label !== current && !auxiliaryWindows.has(candidate.label));
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

export async function openDocumentWindow(transfer: TabTransfer | null, at?: { x: number; y: number }) {
  if (!isDesktop) {
    return;
  }
  const current = getCurrentWindow();
  const rect = await logicalRect(current);
  const label = `doc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const query = new URLSearchParams({ window: "document", ...(transfer ? { transfer: JSON.stringify(transfer) } : {}) });
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
