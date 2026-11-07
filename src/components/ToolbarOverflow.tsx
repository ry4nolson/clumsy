import { useId, useRef, type MouseEvent, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { closeToolMenu, MenuPopover } from "./ToolMenu";

const closesMenu = ".overflow-tools :is(.icon-button, .tool-menu-item, .signature-chip > button:first-child)";

export function ToolbarOverflow({ active, children }: { active: boolean; children: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(closesMenu)) {
      closeToolMenu(event.currentTarget);
    }
  };
  return (
    <>
      <button ref={anchor} type="button" className="icon-button" popoverTarget={id} title="More" aria-label="More" aria-pressed={active}>
        <Ellipsis size={18} />
      </button>
      <MenuPopover id={id} anchor={anchor} label="More" className="toolbar-overflow" onClick={onClick}>
        {children}
      </MenuPopover>
    </>
  );
}
