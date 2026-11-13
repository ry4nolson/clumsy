import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { DEFAULT_SIDEBAR_WIDTH, SIDEBAR_WIDTH_KEY, clampSidebarWidth, parseSidebarWidth, readSidebarWidth, writeSidebarWidth } from "../lib/sidebarWidth";

const applyWidth = (width: number) => document.documentElement.style.setProperty("--sidebar-width", `${width}px`);

applyWidth(readSidebarWidth());
window.addEventListener("storage", (event) => {
  if (event.key === SIDEBAR_WIDTH_KEY) {
    applyWidth(parseSidebarWidth(event.newValue));
  }
});

const setWidth = (width: number) => {
  applyWidth(width);
  writeSidebarWidth(width);
};

export function SidebarShell({ children }: { children: ReactNode }) {
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const sidebar = handle.parentElement;
    if (event.button !== 0 || !sidebar) {
      return;
    }
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = sidebar.getBoundingClientRect().width;
    const available = sidebar.parentElement?.getBoundingClientRect().width;
    let width = startWidth;
    const move = (moveEvent: PointerEvent) => {
      width = clampSidebarWidth(startWidth + moveEvent.clientX - startX, available);
      applyWidth(width);
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      if (width !== startWidth) {
        writeSidebarWidth(width);
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  };

  return (
    <aside className="app-sidebar">
      {children}
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        onPointerDown={startResize}
        onDoubleClick={() => setWidth(DEFAULT_SIDEBAR_WIDTH)}
      />
    </aside>
  );
}
