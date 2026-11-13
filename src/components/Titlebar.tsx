import { useEffect, useState } from "react";
import { Copy, Menu, Minus, Square, X } from "lucide-react";
import { minimizeWindow, onMaximizedChange, toggleMaximizeWindow } from "../lib/documentWindows";
import { closeWindow } from "../lib/platform";

export function MenuButton({ onOpen }: { onOpen: (x: number, y: number) => void }) {
  return (
    <button
      type="button"
      className="icon-button titlebar-menu"
      title="Menu"
      aria-label="Menu"
      aria-haspopup="menu"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onOpen(rect.left, rect.bottom + 2);
      }}
    >
      <Menu size={18} />
    </button>
  );
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const listening = onMaximizedChange(setMaximized);
    return () => void listening.then((stop) => stop());
  }, []);

  return (
    <div className="window-controls">
      <button type="button" className="window-control" title="Minimize" aria-label="Minimize" onClick={() => void minimizeWindow()}>
        <Minus size={16} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className="window-control"
        title={maximized ? "Restore" : "Maximize"}
        aria-label={maximized ? "Restore" : "Maximize"}
        onClick={() => void toggleMaximizeWindow()}
      >
        {maximized ? <Copy size={13} strokeWidth={1.5} /> : <Square size={13} strokeWidth={1.5} />}
      </button>
      <button type="button" className="window-control close" title="Close" aria-label="Close" onClick={() => void closeWindow()}>
        <X size={17} strokeWidth={1.5} />
      </button>
    </div>
  );
}
