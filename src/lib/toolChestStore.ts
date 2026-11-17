import { forgetSavedContextTools } from "./contextTools";
import { CUSTOM_STAMPS_KEY, loadLibrary } from "./customStamps";
import { showError, type DroppedFile } from "./platform";
import { TOOL_CHEST_KEY, cleanToolChest, readToolChest, writeToolChest, type ToolChest } from "./toolChest";
import { askClashChoice, isToolChestFile, readToolChestFile } from "./toolChestFiles";
import { importClashes, mergedChest } from "./toolChestEdit";

export const TOOL_CHEST_EVENT = "clumsy-tool-chest-changed";

export function saveChest(chest: ToolChest) {
  const before = readToolChest();
  if (!writeToolChest(chest)) {
    void showError("Clumsy couldn't save your tool chest.");
    return;
  }
  const kept = new Set(chest.tools.map((tool) => tool.id));
  forgetSavedContextTools(before.tools.filter((tool) => !kept.has(tool.id)).map((tool) => tool.id));
  window.dispatchEvent(new Event(TOOL_CHEST_EVENT));
}

export function watchChest(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CUSTOM_STAMPS_KEY || event.key === null) {
      loadLibrary();
    }
    if (event.key === TOOL_CHEST_KEY || event.key === CUSTOM_STAMPS_KEY || event.key === null) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(TOOL_CHEST_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(TOOL_CHEST_EVENT, onChange);
  };
}

export async function importChestText(text: string, name = "That file") {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    await showError(`${name} isn't a Clumsy tool chest.`);
    return false;
  }
  const incoming = cleanToolChest(parsed);
  if (!incoming.tools.length) {
    await showError(`${name} has no tools Clumsy can use.`);
    return false;
  }
  const clashes = importClashes(readToolChest(), incoming);
  const choice = clashes.length ? await askClashChoice(clashes.length, clashes[0].name) : "replace";
  saveChest(mergedChest(readToolChest(), incoming, choice).chest);
  return true;
}

const fileName = (file: DroppedFile) => (typeof file === "string" ? (file.split(/[\\/]/).pop() ?? file) : file.name);

export async function importChestFiles(files: DroppedFile[]) {
  for (const file of files) {
    try {
      await importChestText(await readToolChestFile(file), `“${fileName(file)}”`);
    } catch (error) {
      await showError(`Clumsy couldn't import “${fileName(file)}”: ${String(error)}`);
    }
  }
}

export function withoutToolChests(files: DroppedFile[]) {
  const chests = files.filter(isToolChestFile);
  if (chests.length) {
    void importChestFiles(chests);
  }
  return chests.length ? files.filter((file) => !isToolChestFile(file)) : files;
}
