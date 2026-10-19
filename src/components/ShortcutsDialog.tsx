import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { commands, displayCombo, type Command, type MenuName } from "../lib/commands";

const groupOrder: Array<MenuName | "Tabs"> = ["File", "Edit", "View", "Go", "Tools", "Window", "Tabs", "Help"];

type Row = { label: string; keys: string[] };

function shortcutRows(isMac: boolean) {
  const groups = new Map<string, Row[]>();
  const add = (group: string, row: Row) => groups.set(group, [...(groups.get(group) ?? []), row]);
  for (const command of commands) {
    if (!command.combos.length || command.id === "escape" || /^tab\d$/.test(command.id)) {
      continue;
    }
    add(command.menu ?? "Tabs", { label: command.label, keys: command.combos.map((combo) => displayCombo(combo, isMac)) });
  }
  const tabCommands = commands.filter((command: Command) => /^tab\d$/.test(command.id));
  add("Tabs", { label: "Show Tab 1–8", keys: [`${displayCombo(tabCommands[0].combos[0], isMac)}–${displayCombo(tabCommands[7].combos[0], isMac)}`] });
  add("Tabs", { label: "Close Find / Back to Select Tool", keys: ["Esc"] });
  return groupOrder.filter((group) => groups.has(group)).map((group) => [group, groups.get(group)!] as const);
}

type ShortcutsDialogProps = {
  open: boolean;
  isMac: boolean;
  onClose: () => void;
};

export function ShortcutsDialog({ open, isMac, onClose }: ShortcutsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog shortcuts-dialog"
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <header className="shortcuts-header">
        <h2>Keyboard Shortcuts</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="shortcuts-groups">
        {shortcutRows(isMac).map(([group, rows]) => (
          <section key={group}>
            <h3>{group}</h3>
            <dl>
              {rows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    {row.keys.map((key, index) => (
                      <span key={key}>
                        {index > 0 && <span className="shortcut-or">or</span>}
                        <kbd>{key}</kbd>
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
