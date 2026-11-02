import { useSyncExternalStore } from "react";
import { idleEditorUi, type EditorManagers } from "../lib/editorManagers";

const noSubscription = () => () => {};
const idle = () => idleEditorUi;

export function useEditorUi(editorUi: EditorManagers | null) {
  return useSyncExternalStore(editorUi?.subscribe ?? noSubscription, editorUi?.getState ?? idle);
}
