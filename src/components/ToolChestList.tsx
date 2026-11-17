import { useId, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import { BookmarkPlus, Ellipsis } from "lucide-react";
import type { PdfViewerApi } from "../hooks/usePdfViewer";
import type { ToolChestPanel } from "../hooks/useToolChest";
import { readContextTools, savedEntry } from "../lib/contextTools";
import { isDesktop, isMobile, showContextMenu, type ContextMenuItem } from "../lib/platform";
import { parseToolRef, toolLabel, type SavedTool } from "../lib/toolChest";
import { toolSections } from "../lib/toolChestEdit";
import { dropSpot, type DropSpot } from "../lib/toolChestDrag";
import { closeToolMenu, MenuPopover } from "./ToolMenu";
import { ToolSwatch } from "./ToolSwatch";
import "./ToolChest.css";

type Drag = { id: string; pointerId: number; x: number; y: number; moving: boolean };

const DRAG_THRESHOLD = 4;

const toolKind = (tool: SavedTool, label: string) => [label === tool.name ? "" : label, tool.measure?.unit].filter(Boolean).join(" · ");

export function ToolChestList({ chest, viewer }: { chest: ToolChestPanel; viewer: PdfViewerApi }) {
  const menuId = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);
  const [menu, setMenu] = useState<ContextMenuItem[]>([]);
  const [spot, setSpot] = useState<DropSpot | null>(null);
  const sections = toolSections(chest.tools);
  const armed = viewer.armedTool;
  const withContextMenu = isDesktop && !isMobile;

  const toolItems = (tool: SavedTool): ContextMenuItem[] => {
    const inContext = readContextTools().includes(savedEntry(tool.id));
    return [
      { label: "Edit…", run: () => chest.onEdit(tool) },
      { label: "Duplicate", run: () => chest.onDuplicate(tool.id) },
      ...(withContextMenu ? [{ label: inContext ? "Remove from Context Menu" : "Add to Context Menu", run: () => chest.onToggleContext(tool.id) }] : []),
      "-",
      { label: "Delete", run: () => chest.onRemove(tool.id) },
    ];
  };

  const chestItems: ContextMenuItem[] = [
    { label: "Export Tool Chest…", enabled: chest.tools.length > 0, run: () => void chest.onExport() },
    { label: "Import Tool Chest…", run: () => void chest.onImport() },
    "-",
    { label: "Add Starter Tools", run: chest.onRestoreStarter },
    { label: "Clear Tool Chest", enabled: chest.tools.length > 0, run: () => void chest.onClear() },
  ];

  const groupItems = (group: string | null): ContextMenuItem[] => [{ label: group ? `Export “${group}”…` : "Export These Tools…", run: () => void chest.onExport(group) }];

  const openMenu = (event: MouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    anchor.current = event.currentTarget;
    flushSync(() => setMenu(items));
    document.getElementById(menuId)?.showPopover();
  };

  const nativeMenu = (event: MouseEvent<HTMLElement>, items: ContextMenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    void showContextMenu(items).then((shown) => {
      if (!shown) {
        anchor.current = target;
        flushSync(() => setMenu(items));
        document.getElementById(menuId)?.showPopover();
      }
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, tool: SavedTool) => {
    swallowClick.current = false;
    if (event.button === 0 && event.isPrimary) {
      drag.current = { id: tool.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moving: false };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    if (!current.moving && Math.hypot(event.clientX - current.x, event.clientY - current.y) >= DRAG_THRESHOLD) {
      current.moving = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (current.moving && list.current) {
      setSpot(dropSpot(list.current, event.clientX, event.clientY, chest.tools, current.id));
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current?.moving) {
      return;
    }
    swallowClick.current = true;
    setSpot(null);
    const target = list.current && event.type === "pointerup" ? dropSpot(list.current, event.clientX, event.clientY, chest.tools, current.id) : null;
    if (target) {
      chest.onMove(current.id, target.beforeId, target.group);
    }
  };

  return (
    <div className="tool-chest" ref={list}>
      <div className="tool-chest-bar">
        <button type="button" className="tool-chest-new" title="Save the current tool and style" onClick={chest.onNew}>
          <BookmarkPlus size={15} />
          Save Tool…
        </button>
        <button type="button" className="tool-chest-more" title="More" aria-label="More tool chest actions" onClick={(event) => openMenu(event, chestItems)}>
          <Ellipsis size={16} />
        </button>
      </div>
      {chest.removal && (
        <div className="tool-chest-undo" role="status">
          <span>Deleted “{chest.removal.tool.name}”.</span>
          <button type="button" onClick={chest.onUndoRemove}>
            Undo
          </button>
        </div>
      )}
      {chest.tools.length === 0 && <p className="tool-chest-empty">Save a tool from any tool's menu, or right-click a markup and choose Add to Tool Chest.</p>}
      {sections.map((section) => (
        <section key={section.group ?? ""} className={spot && !spot.beforeId && spot.group === section.group ? "tool-chest-section drop-end" : "tool-chest-section"}>
          {(section.group || sections.length > 1) && (
            <h3 className="tool-chest-group" data-group={section.group ?? ""} onContextMenu={(event) => nativeMenu(event, groupItems(section.group))}>
              {section.group ?? "No group"}
              <span className="tool-chest-count">{section.tools.length}</span>
            </h3>
          )}
          <ul>
            {section.tools.map((tool) => {
              const target = parseToolRef(tool.tool);
              return (
                <li key={tool.id} data-tool-id={tool.id} data-group={tool.group ?? ""} className={spot?.beforeId === tool.id ? "drop-before" : undefined}>
                  <button
                    type="button"
                    className="tool-chest-item"
                    aria-pressed={armed === tool.id}
                    title={`${tool.name}: click to use`}
                    onClick={() => {
                      if (swallowClick.current) {
                        swallowClick.current = false;
                        return;
                      }
                      chest.arm(viewer, tool);
                    }}
                    onContextMenu={(event) => nativeMenu(event, toolItems(tool))}
                    onPointerDown={(event) => onPointerDown(event, tool)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  >
                    <ToolSwatch tool={tool} />
                    <span className="tool-chest-name">{tool.name}</span>
                    <span className="tool-chest-kind">{target ? toolKind(tool, toolLabel(target)) : ""}</span>
                  </button>
                  <button type="button" className="tool-chest-row-menu" aria-label={`Actions for ${tool.name}`} onClick={(event) => openMenu(event, toolItems(tool))}>
                    <Ellipsis size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <MenuPopover id={menuId} anchor={anchor} label="Tool chest actions">
        {menu.map((item, index) =>
          item === "-" ? (
            <hr key={index} className="tool-menu-separator" />
          ) : (
            <button
              key={item.label}
              type="button"
              className="tool-menu-item"
              disabled={item.enabled === false}
              onClick={(event) => {
                closeToolMenu(event.currentTarget);
                item.run();
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </MenuPopover>
    </div>
  );
}
