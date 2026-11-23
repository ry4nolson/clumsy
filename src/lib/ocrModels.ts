import { MIN_MODEL_BYTES, modelKey, modelUrl } from "./ocr";

const DATABASE = "clumsy-ocr";
const STORE = "models";

const settled = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function openStore() {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  return settled(request);
}

async function cached(code: string) {
  try {
    const database = await openStore();
    const found = await settled<ArrayBuffer | undefined>(database.transaction(STORE).objectStore(STORE).get(modelKey(code)));
    database.close();
    return found instanceof ArrayBuffer && found.byteLength >= MIN_MODEL_BYTES ? found : null;
  } catch {
    return null;
  }
}

async function remember(code: string, model: ArrayBuffer) {
  try {
    const database = await openStore();
    await settled(database.transaction(STORE, "readwrite").objectStore(STORE).put(model, modelKey(code)));
    database.close();
  } catch {
    return;
  }
}

export async function forgetModel(code: string) {
  try {
    const database = await openStore();
    await settled(database.transaction(STORE, "readwrite").objectStore(STORE).delete(modelKey(code)));
    database.close();
  } catch {
    return;
  }
}

export const hasModel = async (code: string) => !!(await cached(code));

export async function loadModel(code: string, signal: AbortSignal, onDownload: () => void) {
  const stored = await cached(code);
  if (stored) {
    return stored;
  }
  onDownload();
  const response = await fetch(modelUrl(code), { signal });
  if (!response.ok) {
    throw new Error(`The download failed (${response.status}).`);
  }
  const model = await response.arrayBuffer();
  if (model.byteLength < MIN_MODEL_BYTES) {
    throw new Error("The download wasn't language data.");
  }
  await remember(code, model);
  return model;
}
