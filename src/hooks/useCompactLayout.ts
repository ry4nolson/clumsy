import { useSyncExternalStore } from "react";
import { COMPACT_QUERY, isTouchDevice } from "../lib/drawer";

const query = isTouchDevice && typeof window !== "undefined" ? window.matchMedia(COMPACT_QUERY) : null;

function subscribe(changed: () => void) {
  query?.addEventListener("change", changed);
  return () => query?.removeEventListener("change", changed);
}

export function useCompactLayout() {
  return useSyncExternalStore(subscribe, () => query?.matches ?? false);
}
