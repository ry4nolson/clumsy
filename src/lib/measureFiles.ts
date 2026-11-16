import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { isDesktop } from "./platform";

export async function pickCsvSavePath(suggestedName: string) {
  return invoke<string | null>("pick_csv_save_path", { suggestedName });
}

export async function writeTextExport(path: string, text: string) {
  return invoke<string>("write_text_export", new TextEncoder().encode(text), { headers: { "x-path": encodeURIComponent(path) } });
}

export async function copyPlainText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position: fixed; opacity: 0;";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

export async function askForScale() {
  const prompt = "This page has no scale, so measurements will be at full size (1:1). Set the drawing's scale first?";
  if (!isDesktop) {
    return window.confirm(prompt);
  }
  return ask(prompt, { title: "No scale set", kind: "info", okLabel: "Set Scale…", cancelLabel: "Measure at Full Size" });
}
