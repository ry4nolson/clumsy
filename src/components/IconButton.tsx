import type { ReactNode } from "react";

export function IconButton({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="icon-button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
