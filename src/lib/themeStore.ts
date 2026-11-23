import { cleanThemeChoice, resolveTheme, slotNames, slotVariables, type AppliedTheme, type ThemeBase, type ThemeChoice } from "./themes";

export const THEME_KEY = "clumsy.theme";
export const THEME_BOOT_KEY = "clumsy.themeBoot";
export const THEME_EVENT = "clumsy-theme-changed";
const SYSTEM_DARK_KEY = "clumsy.systemDark";

export function readThemeChoice(): ThemeChoice {
  try {
    return cleanThemeChoice(JSON.parse(localStorage.getItem(THEME_KEY) ?? "null"));
  } catch {
    return "system";
  }
}

export function writeThemeChoice(choice: ThemeChoice, applied: AppliedTheme) {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(choice));
    if (applied.id) {
      localStorage.setItem(THEME_BOOT_KEY, JSON.stringify(applied));
    } else {
      localStorage.removeItem(THEME_BOOT_KEY);
    }
  } catch {
    return;
  }
}

export function readSystemDark(): boolean | null {
  try {
    const stored = localStorage.getItem(SYSTEM_DARK_KEY);
    return stored === null ? null : stored === "true";
  } catch {
    return null;
  }
}

export function writeSystemDark(dark: boolean) {
  try {
    localStorage.setItem(SYSTEM_DARK_KEY, String(dark));
  } catch {
    return;
  }
}

export const currentBase = (): ThemeBase => (document.documentElement.dataset.base === "dark" ? "dark" : "light");

export function applyTheme(applied: AppliedTheme, root = document.documentElement) {
  root.dataset.base = applied.base;
  if (applied.id) {
    root.dataset.theme = applied.id;
  } else {
    delete root.dataset.theme;
  }
  for (const name of slotNames) {
    const variable = slotVariables[name];
    const value = applied.variables[variable];
    if (value) {
      root.style.setProperty(variable, value);
    } else {
      root.style.removeProperty(variable);
    }
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export const showTheme = (choice: ThemeChoice, systemDark: boolean) => {
  const applied = resolveTheme(choice, systemDark);
  applyTheme(applied);
  return applied;
};

export function watchThemeChoice(onChange: (choice: ThemeChoice) => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) {
      onChange(readThemeChoice());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
