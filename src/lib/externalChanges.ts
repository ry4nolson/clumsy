type ReloadableTab = { path: string | null; stamp: string | null; carriedChanges: boolean };

type ViewerState = { loaded: boolean; modified: boolean; tool?: string };

const unfinishedEditTools = new Set(["draw", "text"]);
const EOF_MARKER = "%%EOF";
const EOF_WINDOW = 1024;

export function canReload(tab: ReloadableTab, viewer: ViewerState | undefined, diskStamp: string | null) {
  if (!tab.path || !tab.stamp || !diskStamp || diskStamp === tab.stamp) {
    return false;
  }
  if (!viewer?.loaded || viewer.modified || tab.carriedChanges) {
    return false;
  }
  return !unfinishedEditTools.has(viewer.tool ?? "");
}

export function looksComplete(bytes: Uint8Array) {
  const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - EOF_WINDOW)));
  return tail.includes(EOF_MARKER);
}
