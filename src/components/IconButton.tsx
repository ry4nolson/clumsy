import type { MouseEvent, ReactNode } from "react";

type IconButtonProps = {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
};

export function IconButton({ title, active, disabled, onClick, onContextMenu, children }: IconButtonProps) {
  return (
    <button type="button" className="icon-button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick} onContextMenu={onContextMenu}>
      {children}
    </button>
  );
}
