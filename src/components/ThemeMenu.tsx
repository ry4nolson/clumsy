import { useId, useRef } from "react";
import { Check, Palette } from "lucide-react";
import { systemThemes, themeChoices, themes, type ThemeChoice } from "../lib/themes";
import { closeToolMenu, MenuPopover } from "./ToolMenu";

type ThemeMenuProps = {
  theme: ThemeChoice;
  onTheme: (choice: ThemeChoice) => void;
  onPreview: (choice: ThemeChoice | null) => void;
};

const slotsOf = (id: string) => themes.find((theme) => theme.id === id)!.slots;

function swatch(choice: ThemeChoice) {
  if (choice === "system") {
    return `linear-gradient(135deg, ${slotsOf(systemThemes.light).ink} 50%, ${slotsOf(systemThemes.dark).ink} 50%)`;
  }
  const { ink, ember } = slotsOf(choice);
  return `linear-gradient(135deg, ${ink} 50%, ${ember} 50%)`;
}

export function ThemeMenu({ theme, onTheme, onPreview }: ThemeMenuProps) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} type="button" className="icon-button" popoverTarget={id} title="Theme" aria-label="Theme">
        <Palette size={18} />
      </button>
      <MenuPopover id={id} anchor={anchor} label="Theme" className="theme-menu" onClose={() => onPreview(null)}>
        <div className="theme-list" role="radiogroup" aria-label="Theme" onPointerLeave={() => onPreview(null)}>
          {themeChoices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={choice.id === theme}
              className="tool-menu-item"
              onPointerEnter={() => onPreview(choice.id)}
              onFocus={() => onPreview(choice.id)}
              onClick={(event) => {
                onTheme(choice.id);
                closeToolMenu(event.currentTarget);
              }}
            >
              <span className="theme-swatch" style={{ background: swatch(choice.id) }} />
              <span className="theme-name">{choice.label}</span>
              {choice.id === theme && <Check size={14} />}
            </button>
          ))}
        </div>
      </MenuPopover>
    </>
  );
}
