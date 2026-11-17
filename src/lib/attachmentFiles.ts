import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./platform";

export async function saveAttachmentFile(name: string, bytes: Uint8Array) {
  if (!isDesktop) {
    const url = URL.createObjectURL(new Blob([bytes.slice()]));
    const link = Object.assign(document.createElement("a"), { href: url, download: name });
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }
  return invoke<string | null>("save_attachment", bytes, { headers: { "x-name": encodeURIComponent(name) } });
}
