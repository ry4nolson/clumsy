import { isTypingTarget } from "./commands";
import { movedMarkup, removedMarkup, type Markup } from "./markup";
import { nudgeDelta } from "./markupDraft";
import { clampShift, outerRect } from "./markupShapes";
import { pdfDate } from "./notes";

type KeyPageView = { viewport: { scale: number; convertToPdfPoint(x: number, y: number): number[] }; pdfPage: { view: number[] } | null };

type KeyDeps = {
  container: HTMLElement;
  building(): boolean;
  buildKey(event: KeyboardEvent): boolean;
  selected(): Markup | null;
  deselect(): void;
  pageView(pageIndex: number): KeyPageView | undefined;
  change(markup: Markup, after: Markup | null, coalesce?: string): boolean;
  removed(): void;
};

export function attachMarkupKeys({ container, building, buildKey, selected, deselect, pageView, change, removed }: KeyDeps) {
  const visible = () => container.contains(document.activeElement) && !container.closest("[inert]") && !document.querySelector("dialog[open], :popover-open");

  const nudge = (markup: Markup, key: string, step: number) => {
    const view = pageView(markup.pageIndex);
    const delta = view?.pdfPage && nudgeDelta(view.viewport, key, step);
    const [dx, dy] = delta ? clampShift(outerRect(markup), delta[0], delta[1], view.pdfPage!.view) : [0, 0];
    if (dx || dy) {
      change(markup, movedMarkup(markup, dx, dy, pdfDate(new Date())), "nudge");
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (building() && visible() && !isTypingTarget(event.target) && buildKey(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const markup = selected();
    if (!markup || !visible() || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (event.key === "Escape") {
      deselect();
    } else if (event.key === "Backspace" || event.key === "Delete") {
      if (change(markup, removedMarkup(markup, pdfDate(new Date())))) {
        removed();
      }
    } else if (event.key.startsWith("Arrow")) {
      nudge(markup, event.key, event.shiftKey ? 10 : 1);
    } else {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
