import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import type { ExportFormat } from "./imageExport";
import type { ImageFile } from "./imagePdf";
import { fileNameFromPath, isDesktop, pickFilesInBrowser, readPdfFromFile, readPdfFromPath, revealInFinder, type DroppedFile, type PdfSource } from "./platform";

export type OpenedFile = { kind: "pdf"; source: Promise<PdfSource> } | { kind: "image"; image: Promise<ImageFile> };

const imageTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  avif: "image/avif",
};

const placeableTypes = ["png", "jpg", "jpeg", "webp", "gif", "svg"].map((extension) => imageTypes[extension]);

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

const isPdfName = (name: string) => /\.pdf$/i.test(name);

const isImageName = (name: string) => extensionOf(name) in imageTypes;

async function readImageFromPath(path: string): Promise<ImageFile> {
  return { name: fileNameFromPath(path), data: new Uint8Array(await invoke<ArrayBuffer>("read_image", { path })) };
}

async function readImageFromFile(file: File): Promise<ImageFile> {
  return { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };
}

export function openedFile(file: DroppedFile): OpenedFile | null {
  const name = typeof file === "string" ? fileNameFromPath(file) : file.name;
  if (isPdfName(name) || (typeof file !== "string" && file.type === "application/pdf")) {
    return { kind: "pdf", source: typeof file === "string" ? readPdfFromPath(file) : readPdfFromFile(file) };
  }
  if (isImageName(name) || (typeof file !== "string" && file.type.startsWith("image/"))) {
    return { kind: "image", image: typeof file === "string" ? readImageFromPath(file) : readImageFromFile(file) };
  }
  return null;
}

export const openedFiles = (files: DroppedFile[]) => files.flatMap((file) => openedFile(file) ?? []);

export async function pickImages(includePdfs = false): Promise<OpenedFile[]> {
  if (!isDesktop) {
    const accept = [...(includePdfs ? ["application/pdf", ".pdf"] : []), ...Object.values(imageTypes), ...Object.keys(imageTypes).map((extension) => `.${extension}`)];
    return openedFiles(await pickFilesInBrowser(accept.join(","), true));
  }
  return openedFiles(await invoke<string[]>("pick_images", { includePdfs }));
}

export async function pickImage(): Promise<File | null> {
  if (!isDesktop) {
    return (await pickFilesInBrowser(placeableTypes.join(","), false))[0] ?? null;
  }
  const path = await invoke<string | null>("pick_image");
  if (!path) {
    return null;
  }
  const { name, data } = await readImageFromPath(path);
  return new File([data as BlobPart], name, { type: imageTypes[extensionOf(name)] ?? "application/octet-stream" });
}

export async function pickFolder() {
  return invoke<string | null>("pick_folder");
}

export async function pickImageSavePath(suggestedName: string, format: ExportFormat) {
  return invoke<string | null>("pick_image_save_path", { suggestedName, format });
}

export async function existingFiles(folder: string, names: string[]) {
  return invoke<string[]>("existing_files", { folder, names });
}

export async function writeImage(path: string, data: Uint8Array) {
  return invoke<string>("write_image", data, { headers: { "x-path": encodeURIComponent(path) } });
}

export async function writeImageInFolder(folder: string, name: string, data: Uint8Array, overwrite: boolean) {
  const headers = { "x-folder": encodeURIComponent(folder), "x-name": encodeURIComponent(name), "x-overwrite": overwrite ? "1" : "0" };
  return invoke<string>("write_image", data, { headers });
}

export function downloadImage(name: string, data: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function offerToShowExport(summary: string, path: string) {
  if (await ask(summary, { title: "Export finished", kind: "info", okLabel: "Show in Finder", cancelLabel: "Done" })) {
    await revealInFinder(path);
  }
}

export async function confirmReplace(names: string[], folder: string) {
  const prompt =
    names.length === 1
      ? `“${names[0]}” already exists in “${fileNameFromPath(folder)}”. Replace it?`
      : `${names.length} of these images already exist in “${fileNameFromPath(folder)}”, including “${names[0]}”. Replace them?`;
  if (!isDesktop) {
    return window.confirm(prompt);
  }
  return ask(prompt, { title: "Replace existing files?", kind: "warning", okLabel: "Replace", cancelLabel: "Cancel" });
}
