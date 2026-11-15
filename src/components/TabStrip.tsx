import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { useCompactLayout } from "../hooks/useCompactLayout";
import type { TabItem } from "../lib/tabs";
import { TabIcon, TabSwitcher } from "./TabSwitcher";

type TabStripProps = {
  paneId: string;
  column: number;
  focused: boolean;
  tabs: TabItem[];
  activeId: string;
  draggedTabId: string | null;
  insertAt: number | null;
  newTabShortcut: string;
  titlebar: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
  onTabPointerDown: (id: string, event: ReactPointerEvent) => void;
};

export function TabStrip({
  paneId,
  column,
  focused,
  tabs,
  activeId,
  draggedTabId,
  insertAt,
  newTabShortcut,
  titlebar,
  leading,
  trailing,
  onSelect,
  onClose,
  onNewTab,
  onTabPointerDown,
}: TabStripProps) {
  const compact = useCompactLayout();
  return (
    <div
      className={`tab-strip${focused ? " focused" : ""}${insertAt === tabs.length ? " insert-end" : ""}`}
      data-pane-strip={paneId}
      data-pane-id={paneId}
      style={{ gridColumn: column }}
      data-tauri-drag-region={titlebar || undefined}
      onDoubleClick={(event) => {
        if (!titlebar && event.target === event.currentTarget) {
          onNewTab();
        }
      }}
    >
      {leading}
      {compact ? (
        <TabSwitcher tabs={tabs} activeId={activeId} onSelect={onSelect} onClose={onClose} />
      ) : (
        <div className="tab-list" role="tablist" aria-label="Open documents">
          {tabs.map((tab, index) => {
            const active = tab.id === activeId;
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                className={`tab${active ? " active" : ""}${tab.modified ? " modified" : ""}${tab.id === draggedTabId ? " dragged" : ""}${insertAt === index ? " insert-before" : ""}`}
                onPointerDown={(event) => {
                  if (event.pointerType !== "touch" && !(event.target as HTMLElement).closest(".tab-close")) {
                    onTabPointerDown(tab.id, event);
                  }
                }}
                onMouseDown={(event) => {
                  if (event.button === 1) {
                    event.preventDefault();
                    onClose(tab.id);
                  }
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="tab-select"
                  title={tab.tooltip ?? tab.title}
                  onClick={() => onSelect(tab.id)}
                >
                  <TabIcon tab={tab} />
                  <span className="tab-title">{tab.title}</span>
                </button>
                <button
                  type="button"
                  className="tab-close"
                  aria-label={`Close ${tab.title}${tab.modified ? " (unsaved changes)" : ""}`}
                  title="Close tab"
                  onClick={() => onClose(tab.id)}
                >
                  <span className="tab-dot" aria-hidden="true" />
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button type="button" className="icon-button tab-new" aria-label="New tab" title={`New tab (${newTabShortcut})`} onClick={onNewTab}>
        <Plus size={16} />
      </button>
      {trailing}
    </div>
  );
}
