import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type RefObject, type ToggleEvent } from "react";
import { ChevronDown } from "lucide-react";

export function closeToolMenu(element: Element) {
  element.closest<HTMLElement>(".tool-menu")?.hidePopover();
}

type MenuPopoverProps = {
  id: string;
  anchor: RefObject<HTMLElement | null>;
  label: string;
  className?: string;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
};

export function MenuPopover({ id, anchor, label, className, onClick, children }: MenuPopoverProps) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => menu.current?.hidePopover();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.matches(":popover-open") && !menu.current.querySelector(".tool-menu:popover-open")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  const place = (event: ToggleEvent<HTMLDivElement>) => {
    const rect = anchor.current?.getBoundingClientRect();
    if (event.newState !== "open" || !rect) {
      return;
    }
    const style = event.currentTarget.style;
    style.top = `${rect.bottom + 6}px`;
    if (rect.left > window.innerWidth / 2) {
      style.left = "auto";
      style.right = `${window.innerWidth - rect.right}px`;
    } else {
      style.left = `${rect.left}px`;
      style.right = "auto";
    }
  };

  return (
    <div
      ref={menu}
      id={id}
      popover="auto"
      className={className ? `tool-menu ${className}` : "tool-menu"}
      role="dialog"
      aria-label={label}
      onBeforeToggle={place}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

type ToolMenuProps = {
  label: string;
  active: boolean;
  button: ReactNode;
  keepOpenWhenInactive?: boolean;
  onOpen?: () => void;
  children: ReactNode;
};

export function ToolMenu({ label, active, button, keepOpenWhenInactive, onOpen, children }: ToolMenuProps) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = document.getElementById(id);
    if (!active && !keepOpenWhenInactive && menu?.matches(":popover-open")) {
      menu.hidePopover();
    }
  }, [id, active, keepOpenWhenInactive]);

  return (
    <div ref={anchor} className={`tool-split${active ? " active" : ""}`}>
      {button}
      <button type="button" className="tool-split-toggle" popoverTarget={id} title={label} aria-label={label} onClick={onOpen}>
        <ChevronDown size={11} strokeWidth={2.5} />
      </button>
      <MenuPopover id={id} anchor={anchor} label={label}>
        {children}
      </MenuPopover>
    </div>
  );
}
