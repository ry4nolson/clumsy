const WIDE_ENOUGH = 700;

const OPEN_TOGGLE = '.toolbar .icon-button[aria-label^="Toggle sidebar"][aria-pressed="true"]';

export const sidebarFits = (width = window.innerWidth) => width >= WIDE_ENOUGH;

export const COMPACT_QUERY = `(max-width: ${WIDE_ENOUGH - 1}px)`;

export const isTouchDevice = typeof navigator !== "undefined" && /Android|iPhone|iPad/.test(navigator.userAgent);

export const startsCompact = isTouchDevice && typeof window !== "undefined" && !sidebarFits();

export function closeDrawer(scope: Document = document) {
  const sidebar = scope.querySelector(".app-sidebar:not([inert] *)");
  const toggle = scope.querySelector<HTMLElement>(OPEN_TOGGLE);
  if (!sidebar || !toggle || getComputedStyle(sidebar).position !== "absolute") {
    return false;
  }
  toggle.click();
  return true;
}
