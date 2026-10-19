import { FileText, House, LoaderCircle, Plus, X } from "lucide-react";

export type TabItem = {
  id: string;
  title: string;
  kind: "start" | "document";
  loading: boolean;
  modified: boolean;
  tooltip?: string;
};

type TabStripProps = {
  tabs: TabItem[];
  activeId: string;
  newTabShortcut: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
};

function TabIcon({ tab }: { tab: TabItem }) {
  if (tab.loading) {
    return <LoaderCircle size={14} className="spin" />;
  }
  return tab.kind === "start" ? <House size={14} /> : <FileText size={14} />;
}

export function TabStrip({ tabs, activeId, newTabShortcut, onSelect, onClose, onNewTab }: TabStripProps) {
  return (
    <div
      className="tab-strip"
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) {
          onNewTab();
        }
      }}
    >
      <div className="tab-list" role="tablist" aria-label="Open documents">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              className={`tab${active ? " active" : ""}${tab.modified ? " modified" : ""}`}
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
