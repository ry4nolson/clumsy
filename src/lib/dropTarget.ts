import type { DropPoint } from "./platform";

export type DropTarget = { tabId: string; slot: number };

export function slotAt(container: HTMLElement, y: number) {
  const thumbnails = Array.from(container.querySelectorAll<HTMLElement>(".thumbnail"));
  const index = thumbnails.findIndex((thumbnail) => {
    const rect = thumbnail.getBoundingClientRect();
    return y < rect.top + rect.height / 2;
  });
  return index < 0 ? thumbnails.length : index;
}

export function dropTargetAt(point: DropPoint): DropTarget | null {
  const element = document.elementFromPoint(point.x, point.y);
  const thumbnails = element?.closest<HTMLElement>(".thumbnails");
  const tabId = thumbnails?.closest<HTMLElement>(".document-tab:not(.inactive)")?.dataset.tabId;
  return thumbnails && tabId ? { tabId, slot: slotAt(thumbnails, point.y) } : null;
}

export function showDropTarget(target: DropTarget | null) {
  document.querySelectorAll("[data-drop-target], [data-drop-slot]").forEach((element) => {
    element.removeAttribute("data-drop-target");
    element.removeAttribute("data-drop-slot");
  });
  if (!target) {
    return;
  }
  const container = document.querySelector(`.document-tab[data-tab-id="${target.tabId}"] .thumbnails`);
  container?.setAttribute("data-drop-target", "");
  const thumbnails = container?.querySelectorAll(".thumbnail");
  const marked = thumbnails?.[target.slot] ?? thumbnails?.[thumbnails.length - 1];
  marked?.setAttribute("data-drop-slot", target.slot < (thumbnails?.length ?? 0) ? "before" : "after");
}
