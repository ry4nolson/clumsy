import { useEffect, useRef } from "react";
import { commands, displayCombo, type Command, type MenuName } from "../lib/commands";

const groupOrder: Array<MenuName | "Tabs"> = ["File", "Edit", "View", "Go", "Pages", "Tools", "Window", "Tabs", "Help"];

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

export function ShortcutsDialog({ open, isMac, onClose }: { open: boolean; isMac: boolean; onClose: () => void }) {
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
      className="dialog sheet info-sheet shortcuts-sheet"
      aria-label="Keyboard Shortcuts"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="info-sheet-header">
        <h2>Keyboard Shortcuts</h2>
        <button type="button" className="button" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="shortcuts-body">
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
      </div>
    </dialog>
  );
}
