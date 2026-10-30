import type { PointerEvent as ReactPointerEvent } from "react";
import { FileCode2, FileText, House, LoaderCircle, Plus, X } from "lucide-react";

export type TabItem = {
  id: string;
  title: string;
  kind: "start" | "document" | "markdown";
  loading: boolean;
  modified: boolean;
  tooltip?: string;
};

type TabStripProps = {
  paneId: string;
  column: number;
  focused: boolean;
  tabs: TabItem[];
  activeId: string;
  draggedTabId: string | null;
  insertAt: number | null;
  newTabShortcut: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
  onTabPointerDown: (id: string, event: ReactPointerEvent) => void;
};

function TabIcon({ tab }: { tab: TabItem }) {
  if (tab.loading) {
    return <LoaderCircle size={14} className="spin" />;
  }
  if (tab.kind === "start") {
    return <House size={14} />;
  }
  return tab.kind === "markdown" ? <FileCode2 size={14} /> : <FileText size={14} />;
}

export function TabStrip({
  paneId,
  column,
  focused,
  tabs,
  activeId,
  draggedTabId,
  insertAt,
  newTabShortcut,
  onSelect,
  onClose,
  onNewTab,
  onTabPointerDown,
}: TabStripProps) {
  return (
    <div
      className={`tab-strip${focused ? " focused" : ""}${insertAt === tabs.length ? " insert-end" : ""}`}
      data-pane-strip={paneId}
      data-pane-id={paneId}
      style={{ gridColumn: column }}
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) {
          onNewTab();
        }
      }}
    >
      <div className="tab-list" role="tablist" aria-label="Open documents">
        {tabs.map((tab, index) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={`tab${active ? " active" : ""}${tab.modified ? " modified" : ""}${tab.id === draggedTabId ? " dragged" : ""}${insertAt === index ? " insert-before" : ""}`}
              onPointerDown={(event) => {
                if (!(event.target as HTMLElement).closest(".tab-close")) {
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
      <button type="button" className="icon-button tab-new" aria-label="New tab" title={`New tab (${newTabShortcut})`} onClick={onNewTab}>
        <Plus size={16} />
      </button>
    </div>
  );
}
