import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { isDesktop, pickFilesInBrowser, type DroppedFile } from "./platform";
import { TOOL_CHEST_EXTENSION } from "./toolChest";
import type { ClashChoice } from "./toolChestEdit";

export const isToolChestFile = (file: DroppedFile) => (typeof file === "string" ? file : file.name).toLowerCase().endsWith(`.${TOOL_CHEST_EXTENSION}`);

export function toolChestFileName(name: string) {
  const base = name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Tool Chest";
  return `${base}.${TOOL_CHEST_EXTENSION}`;
}

function downloadInBrowser(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveToolChestFile(name: string, text: string) {
  if (!isDesktop) {
    downloadInBrowser(name, text);
    return true;
  }
  const path = await invoke<string | null>("pick_tool_chest_save_path", { suggestedName: name });
  if (!path) {
    return false;
  }
  await invoke<string>("write_tool_chest", new TextEncoder().encode(text), { headers: { "x-path": encodeURIComponent(path) } });
  return true;
}

export async function readToolChestFile(file: DroppedFile) {
  return typeof file === "string" ? invoke<string>("read_tool_chest", { path: file }) : file.text();
}

export async function pickToolChestFile(): Promise<string | null> {
  if (!isDesktop) {
    const [file] = await pickFilesInBrowser(`.${TOOL_CHEST_EXTENSION}`, false);
    return file ? file.text() : null;
  }
  const path = await invoke<string | null>("pick_tool_chest");
  return path ? readToolChestFile(path) : null;
}

export async function askClashChoice(count: number, example: string): Promise<ClashChoice> {
  const prompt =
    count === 1
      ? `Your tool chest already has a tool named “${example}” in the same group. Replace it, or keep both?`
      : `${count} imported tools, including “${example}”, have the same name and group as tools you already have. Replace them, or keep both?`;
  if (!isDesktop) {
    return window.confirm(`${prompt}\n\nOK replaces them; Cancel keeps both.`) ? "replace" : "keepBoth";
  }
  return (await ask(prompt, { title: "Import Tool Chest", kind: "info", okLabel: "Replace", cancelLabel: "Keep Both" })) ? "replace" : "keepBoth";
}

export async function confirmClearChest() {
  const prompt = "Remove every tool from your tool chest? Markups you've already made keep their names.";
  if (!isDesktop) {
    return window.confirm(prompt);
  }
  return ask(prompt, { title: "Clear Tool Chest", kind: "warning", okLabel: "Clear", cancelLabel: "Cancel" });
}
