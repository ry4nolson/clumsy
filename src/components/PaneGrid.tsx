import { Fragment, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { MAX_PANES, type Pane } from "../lib/workspace";
import { TabStrip, type TabItem } from "./TabStrip";

export type TabDropTarget = { kind: "pane"; paneId: string; index: number } | { kind: "newPane"; afterPaneId: string };

type DragState = {
  tabId: string;
  title: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  target: TabDropTarget | null;
};

type PaneGridProps = {
  panes: Pane[];
  focusedPaneId: string;
  tabItems: Record<string, TabItem>;
  newTabShortcut: string;
  overlay?: ReactNode;
  children: ReactNode;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: (paneId: string) => void;
  onFocusPane: (paneId: string) => void;
  onMoveTab: (tabId: string, target: TabDropTarget) => void;
  onResize: (sizes: Record<string, number>) => void;
};

const MIN_PANE_WIDTH = 240;
const DRAG_THRESHOLD = 5;
const SPLIT_ZONE = 0.25;

function findTarget(x: number, y: number, panes: Pane[], draggedTabId: string): TabDropTarget | null {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!(element instanceof HTMLElement)) {
      continue;
    }
    const strip = element.closest<HTMLElement>("[data-pane-strip]");
    if (strip) {
      const paneId = strip.dataset.paneStrip!;
      const pane = panes.find((candidate) => candidate.id === paneId);
      if (!pane) {
        return null;
      }
      const tabs = [...strip.querySelectorAll<HTMLElement>("[data-tab-id]")];
      const hovered = tabs.findIndex((tab) => {
        const rect = tab.getBoundingClientRect();
        return x >= rect.left && x <= rect.right;
      });
      if (hovered === -1) {
        return { kind: "pane", paneId, index: pane.tabIds.length };
      }
      const rect = tabs[hovered].getBoundingClientRect();
      return { kind: "pane", paneId, index: hovered + (x > rect.left + rect.width / 2 ? 1 : 0) };
    }
    const content = element.closest<HTMLElement>("[data-pane-id]");
    if (content) {
      const paneId = content.dataset.paneId!;
      const pane = panes.find((candidate) => candidate.id === paneId);
      const rect = content.getBoundingClientRect();
      const inSplitZone = x > rect.right - rect.width * SPLIT_ZONE;
      const canSplit = panes.length < MAX_PANES && !(pane?.tabIds.length === 1 && pane.tabIds[0] === draggedTabId);
      if (inSplitZone && canSplit) {
        return { kind: "newPane", afterPaneId: paneId };
      }
      return pane ? { kind: "pane", paneId, index: pane.tabIds.length } : null;
    }
  }
  return null;
}

export function PaneGrid({
  panes,
  focusedPaneId,
  tabItems,
  newTabShortcut,
  overlay,
  children,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onFocusPane,
  onMoveTab,
  onResize,
}: PaneGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const callbacks = useRef({ onMoveTab, onResize });
  callbacks.current = { onMoveTab, onResize };

  useEffect(() => {
    if (!drag) {
      return;
    }
    const move = (event: PointerEvent) => {
      const current = dragRef.current!;
      const active = current.active || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > DRAG_THRESHOLD;
      setDrag({
        ...current,
        x: event.clientX,
        y: event.clientY,
        active,
        target: active ? findTarget(event.clientX, event.clientY, panesRef.current, current.tabId) : null,
      });
    };
    const finish = () => {
      const current = dragRef.current;
      setDrag(null);
      if (current?.active && current.target) {
        callbacks.current.onMoveTab(current.tabId, current.target);
      }
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrag(null);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("keydown", cancel);
    };
  }, [drag !== null]);

  const startTabDrag = (tabId: string, event: ReactPointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    setDrag({ tabId, title: tabItems[tabId]?.title ?? "", startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, target: null });
  };

  const startResize = (leftIndex: number, event: ReactPointerEvent<HTMLDivElement>) => {
    const grid = gridRef.current;
    const left = panes[leftIndex];
    const right = panes[leftIndex + 1];
    const leftStrip = grid?.querySelector<HTMLElement>(`[data-pane-strip="${left.id}"]`);
    const rightStrip = grid?.querySelector<HTMLElement>(`[data-pane-strip="${right.id}"]`);
    if (!leftStrip || !rightStrip) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const leftWidth = leftStrip.getBoundingClientRect().width;
    const total = leftWidth + rightStrip.getBoundingClientRect().width;
    const sizeTotal = left.size + right.size;
    setResizing(true);
    const move = (moveEvent: PointerEvent) => {
      const width = Math.min(Math.max(leftWidth + moveEvent.clientX - startX, MIN_PANE_WIDTH), total - MIN_PANE_WIDTH);
      const leftSize = (sizeTotal * width) / total;
      callbacks.current.onResize({ [left.id]: leftSize, [right.id]: sizeTotal - leftSize });
    };
    const stop = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const columns = panes.map((pane) => `minmax(${MIN_PANE_WIDTH}px, ${pane.size}fr)`).join(" 5px ");
  const split = panes.length > 1;
  const target = drag?.active ? drag.target : null;

  return (
    <div
      ref={gridRef}
      className={`workspace${split ? " split" : ""}${drag?.active ? " dragging-tab" : ""}${resizing ? " resizing" : ""}`}
      style={{ gridTemplateColumns: columns }}
      onPointerDownCapture={(event) => {
        const paneId = (event.target as HTMLElement).closest<HTMLElement>("[data-pane-id]")?.dataset.paneId;
        if (paneId && paneId !== focusedPaneId) {
          onFocusPane(paneId);
        }
      }}
    >
      {panes.map((pane, index) => (
        <Fragment key={pane.id}>
          <TabStrip
            paneId={pane.id}
            column={index * 2 + 1}
            focused={split && pane.id === focusedPaneId}
            tabs={pane.tabIds.map((id) => tabItems[id]).filter(Boolean)}
            activeId={pane.activeTabId}
            draggedTabId={drag?.active ? drag.tabId : null}
            insertAt={target?.kind === "pane" && target.paneId === pane.id ? target.index : null}
            newTabShortcut={newTabShortcut}
            onSelect={onSelectTab}
            onClose={onCloseTab}
            onNewTab={() => onNewTab(pane.id)}
            onTabPointerDown={startTabDrag}
          />
          <div className="pane-overlay" style={{ gridColumn: index * 2 + 1 }}>
            {target?.kind === "pane" && target.paneId === pane.id && <div className="pane-drop pane-drop-whole" />}
            {target?.kind === "newPane" && target.afterPaneId === pane.id && <div className="pane-drop pane-drop-split" />}
          </div>
          {index < panes.length - 1 && (
            <div
              className="pane-divider"
              role="separator"
              aria-orientation="vertical"
              style={{ gridColumn: index * 2 + 2 }}
              onPointerDown={(event) => startResize(index, event)}
            />
          )}
        </Fragment>
      ))}
      {children}
      {overlay}
      {drag?.active && (
        <div className="tab-drag-ghost" style={{ transform: `translate(${drag.x + 12}px, ${drag.y + 8}px)` }}>
          {drag.title}
        </div>
      )}
    </div>
  );
}
