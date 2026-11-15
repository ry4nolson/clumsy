import { useId, useRef } from "react";
import { ChevronDown, FileCode2, FileLock, FileText, House, LoaderCircle, X } from "lucide-react";
import type { TabItem } from "../lib/tabs";

export function TabIcon({ tab, size = 14 }: { tab: TabItem; size?: number }) {
  if (tab.loading) {
    return <LoaderCircle size={size} className="spin" />;
  }
  if (tab.kind === "start") {
    return <House size={size} />;
  }
  if (tab.locked) {
    return <FileLock size={size} aria-label="Password protected" />;
  }
  return tab.kind === "markdown" ? <FileCode2 size={size} /> : <FileText size={size} />;
}

type TabSwitcherProps = {
  tabs: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
};

export function TabSwitcher({ tabs, activeId, onSelect, onClose }: TabSwitcherProps) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  if (!active) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="tab-switcher"
        popoverTarget={menuId}
        aria-label={`${active.title}, ${tabs.length} open`}
        onPointerDown={(event) => {
          menuRef.current?.style.setProperty("top", `${event.currentTarget.getBoundingClientRect().bottom + 4}px`);
        }}
      >
        <TabIcon tab={active} size={16} />
        <span className="tab-title">{active.title}</span>
        {active.modified && <span className="tab-dot" aria-label="Unsaved changes" />}
        {tabs.length > 1 && <span className="tab-count">{tabs.length}</span>}
        <ChevronDown size={18} />
      </button>
      <div id={menuId} ref={menuRef} popover="auto" className="tab-menu" role="tablist" aria-label="Open documents">
        {tabs.map((tab) => (
          <div key={tab.id} className={`tab-menu-item${tab.id === activeId ? " active" : ""}`}>
            <button
              type="button"
              role="tab"
              aria-selected={tab.id === activeId}
              className="tab-menu-select"
              onClick={() => {
                menuRef.current?.hidePopover();
                onSelect(tab.id);
              }}
            >
              <TabIcon tab={tab} size={18} />
              <span className="tab-title">{tab.title}</span>
              {tab.modified && <span className="tab-dot" aria-label="Unsaved changes" />}
            </button>
            <button type="button" className="tab-menu-close" aria-label={`Close ${tab.title}`} onClick={() => onClose(tab.id)}>
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
