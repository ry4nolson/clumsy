export type ThemeBase = "light" | "dark";

export const slotNames = ["ink", "inkElevated", "inkLine", "ash", "mist", "bone", "ember", "emberSoft", "emberDeep", "copper", "pulse", "backgroundTop", "backgroundBottom"] as const;

export type SlotName = (typeof slotNames)[number];
export type ThemeSlots = Record<SlotName, string>;

export const slotVariables: Record<SlotName, string> = {
  ink: "--ink",
  inkElevated: "--ink-elevated",
  inkLine: "--ink-line",
  ash: "--ash",
  mist: "--mist",
  bone: "--bone",
  ember: "--ember",
  emberSoft: "--ember-soft",
  emberDeep: "--ember-deep",
  copper: "--copper",
  pulse: "--pulse",
  backgroundTop: "--bg-top",
  backgroundBottom: "--bg-bottom",
};

const themeIds = ["clumsy-light", "clumsy-dark", "ember", "ice", "forest", "paper", "snow", "bloom"] as const;

export type ThemeId = (typeof themeIds)[number];
export type ThemeChoice = "system" | ThemeId;
export type Theme = { id: ThemeId; label: string; base: ThemeBase; slots: ThemeSlots };

function theme(id: ThemeId, label: string, base: ThemeBase, values: string): Theme {
  const hexes = values.split(" ");
  return { id, label, base, slots: Object.fromEntries(slotNames.map((name, index) => [name, `#${hexes[index].toLowerCase()}`])) as ThemeSlots };
}

export const themes: Theme[] = [
  theme("clumsy-light", "Clumsy Light", "light", "F4F4F5 FFFFFF E4E4E7 71717A 71717A 18181B 2563EB 3B82F6 2563EB 71717A 2563EB E4E4E7 E4E4E7"),
  theme("clumsy-dark", "Clumsy Dark", "dark", "18181B 202024 34343A A1A1AA A1A1AA F4F4F5 3B82F6 60A5FA 2563EB A1A1AA 3B82F6 2A2A2F 2A2A2F"),
  theme("ember", "Ember", "dark", "100C0A 1C1612 3A2C26 8B827A D0C8C0 F4EFE8 FF6A3D FF8F66 E04520 D4A574 FFC857 1A1210 0A0706"),
  theme("ice", "Ice", "dark", "070B12 101820 243848 7A8A96 C0D0DC ECF2F6 3DB8FF 6CC8FF 1A7CC7 7EB3C9 9D8CFF 0C141C 05080C"),
  theme("forest", "Forest", "dark", "070C09 101814 244030 7A8B80 C4D4C8 ECF4EE 3DDB8A 6AE8A8 1FA05C A8C47A C4F07A 0C1610 050806"),
  theme("paper", "Paper", "light", "F6F1E8 FFFBF4 E2D6C4 736C62 4A433C 1C1814 E04520 C43818 B83214 A56B3C C48A12 FBF6EE EDE4D4"),
  theme("snow", "Snow", "light", "F3F7FA FFFFFF D0DCE6 66717A 3E4A54 141A20 1A7CC7 1568A8 0E4F86 4A7A90 5B3FB0 F7FAFC E6EEF4"),
  theme("bloom", "Bloom", "light", "FAF3F4 FFFCFC E8D4D8 7A686C 4A383C 1C1214 C41E4A A81840 8C1436 A06070 9B3FC4 FDF7F8 F0E4E6"),
];

export const systemThemes: Record<ThemeBase, ThemeId> = { light: "clumsy-light", dark: "ember" };

export const themeChoices: Array<{ id: ThemeChoice; label: string }> = [{ id: "system", label: "Match System" }, ...themes.map(({ id, label }) => ({ id, label }))];

const themeById = new Map(themes.map((entry) => [entry.id, entry]));

export const cleanThemeChoice = (value: unknown): ThemeChoice => (typeof value === "string" && themeById.has(value as ThemeId) ? (value as ThemeId) : "system");

export const themeVariables = (slots: ThemeSlots): Record<string, string> => Object.fromEntries(slotNames.map((name) => [slotVariables[name], slots[name]]));

export type AppliedTheme = { id: ThemeId | null; base: ThemeBase; variables: Record<string, string> };

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): AppliedTheme {
  const chosen = choice === "system" ? null : themeById.get(choice);
  return chosen ? { id: chosen.id, base: chosen.base, variables: themeVariables(chosen.slots) } : { id: null, base: systemDark ? "dark" : "light", variables: {} };
}

export function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrast(first: string, second: string) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
