import { invoke } from "@tauri-apps/api/core";
import { bytesToBase64 } from "./webviewPolyfills";

const CHUNK_BYTES = 3 * 1024 * 1024;

const needsChunks = typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);

export function chunksOf(bytes: Uint8Array, size = CHUNK_BYTES) {
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < bytes.length; start += size) {
    chunks.push(bytes.subarray(start, start + size));
  }
  return chunks;
}

export async function invokeWithBytes<T>(command: string, bytes: Uint8Array, headers: Record<string, string>) {
  if (!needsChunks) {
    return invoke<T>(command, bytes, { headers });
  }
  const id = crypto.randomUUID();
  try {
    for (const chunk of chunksOf(bytes)) {
      await invoke("upload_chunk", { id, chunk: bytesToBase64(chunk) });
    }
  } catch (error) {
    void invoke("discard_upload", { id });
    throw error;
  }
  return invoke<T>(command, undefined, { headers: { ...headers, "x-upload": id } });
}
