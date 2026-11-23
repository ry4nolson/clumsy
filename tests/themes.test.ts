import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { paletteItems } from "../src/lib/quickPick";
import { themeOfCommand } from "../src/lib/commands";
import { cleanThemeChoice, contrast, luminance, resolveTheme, slotNames, slotVariables, systemThemes, themeChoices, themeVariables, themes, type Theme } from "../src/lib/themes";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const byId = (id: string) => themes.find((theme) => theme.id === id) as Theme;
const stylesheets = [
  ...readdirSync(new URL("../src/styles", import.meta.url)).map((name) => `src/styles/${name}`),
  ...readdirSync(new URL("../src/components", import.meta.url)).filter((name) => name.endsWith(".css")).map((name) => `src/components/${name}`),
  "src/touch.css",
];

describe("theme data", () => {
  it("offers Match System, the two Clumsy themes, then the six presets", () => {
    expect(themeChoices.map((choice) => choice.label)).toEqual(["Match System", "Clumsy Light", "Clumsy Dark", "Ember", "Ice", "Forest", "Paper", "Snow", "Bloom"]);
  });

  it("gives every theme thirteen six-digit colors", () => {
    for (const theme of themes) {
      expect(Object.keys(theme.slots), theme.id).toEqual([...slotNames]);
      for (const name of slotNames) {
        expect(theme.slots[name], `${theme.id} ${name}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("keeps the presets' colors", () => {
    expect(byId("ember").slots).toMatchObject({ ink: "#100c0a", inkElevated: "#1c1612", ember: "#ff6a3d", backgroundBottom: "#0a0706" });
    expect(byId("ice").slots).toMatchObject({ ink: "#070b12", ember: "#3db8ff", pulse: "#9d8cff" });
    expect(byId("forest").slots).toMatchObject({ ink: "#070c09", ember: "#3ddb8a", copper: "#a8c47a" });
    expect(byId("paper").slots).toMatchObject({ ink: "#f6f1e8", ember: "#e04520", emberDeep: "#b83214" });
    expect(byId("snow").slots).toMatchObject({ ink: "#f3f7fa", ember: "#1a7cc7", emberDeep: "#0e4f86" });
    expect(byId("bloom").slots).toMatchObject({ ink: "#faf3f4", ember: "#c41e4a", backgroundTop: "#fdf7f8" });
  });

  it("calls a theme light when its background is light", () => {
    for (const theme of themes) {
      expect(luminance(theme.slots.ink) >= 0.55 ? "light" : "dark", theme.id).toBe(theme.base);
    }
  });

  it("keeps text, muted text, and accent text readable", () => {
    for (const { id, base, slots } of themes) {
      const accentText = base === "light" ? slots.emberDeep : slots.ember;
      expect(contrast(slots.bone, slots.ink), `${id} text`).toBeGreaterThan(7);
      const floor = id.startsWith("clumsy-") ? 4.3 : 4.5;
      expect(contrast(slots.ash, slots.ink), `${id} muted`).toBeGreaterThan(floor);
      expect(contrast(slots.ash, slots.inkElevated), `${id} muted on surface`).toBeGreaterThan(floor);
      expect(contrast(accentText, slots.ink), `${id} accent text`).toBeGreaterThan(floor);
      expect(contrast(accentText, slots.inkElevated), `${id} accent text on surface`).toBeGreaterThan(floor);
    }
  });

  it("keeps text on a filled accent button readable", () => {
    for (const { id, base, slots } of themes.filter((theme) => theme.id !== "clumsy-dark")) {
      const [fill, text] = base === "light" ? [slots.emberDeep, slots.inkElevated] : [slots.ember, slots.ink];
      expect(contrast(text, fill), id).toBeGreaterThan(4.5);
    }
  });
});

describe("choosing a theme", () => {
  it("falls back to Match System for anything unknown", () => {
    expect(cleanThemeChoice("ember")).toBe("ember");
    expect(cleanThemeChoice("system")).toBe("system");
    expect(cleanThemeChoice("sepia")).toBe("system");
    expect(cleanThemeChoice(null)).toBe("system");
    expect(cleanThemeChoice({ id: "ember" })).toBe("system");
  });

  it("follows the system with no variables of its own for Match System", () => {
    expect(resolveTheme("system", true)).toEqual({ id: null, base: "dark", variables: {} });
    expect(resolveTheme("system", false)).toEqual({ id: null, base: "light", variables: {} });
  });

  it("uses the theme's own base and thirteen variables whatever the system says", () => {
    const applied = resolveTheme("paper", true);
    expect(applied.id).toBe("paper");
    expect(applied.base).toBe("light");
    expect(Object.keys(applied.variables).sort()).toEqual(Object.values(slotVariables).sort());
    expect(applied.variables["--ember"]).toBe("#e04520");
  });

  it("lists each theme in the palette under Theme and maps it back", () => {
    const items = paletteItems({ hasDocument: false, split: false, comparing: false, isMac: true });
    expect(items.filter((item) => item.label.startsWith("Theme: ")).map((item) => item.label)).toEqual(themeChoices.map((choice) => `Theme: ${choice.label}`));
    expect(themeOfCommand("theme-forest")).toBe("forest");
    expect(themeOfCommand("theme-system")).toBe("system");
    expect(themeOfCommand("toggleDarkPages")).toBeNull();
  });
});

describe("the stylesheets", () => {
  const block = (css: string, selector: string) => {
    const start = css.indexOf(`${selector} {`);
    return css.slice(start, css.indexOf("\n}", start));
  };
  const declared = (css: string) => Object.fromEntries([...css.matchAll(/(--[a-z-]+): (#[0-9a-f]{6});/g)].map((match) => [match[1], match[2]]));

  it("default to Clumsy Light and Ember, so Match System needs no variables from a script", () => {
    const tokens = read("src/styles/tokens.css");
    expect(declared(block(tokens, ":root"))).toEqual(themeVariables(byId(systemThemes.light).slots));
    expect(declared(block(tokens, ':root[data-base="dark"]'))).toEqual(themeVariables(byId(systemThemes.dark).slots));
    expect(systemThemes).toEqual({ light: "clumsy-light", dark: "ember" });
  });

  it("keep document and status colors apart from the theme's slots", () => {
    const fixed = read("src/styles/fixed.css");
    for (const variable of Object.values(slotVariables)) {
      expect(fixed.includes(`var(${variable})`), variable).toBe(false);
      expect(new RegExp(`${variable}:`).test(fixed), variable).toBe(false);
    }
  });

  it("hard-code no colors outside the token files and the Markdown palette", () => {
    const allowed = new Set(["src/styles/tokens.css", "src/styles/fixed.css", "src/components/Markdown.css"]);
    for (const path of stylesheets.filter((candidate) => !allowed.has(candidate))) {
      const css = read(path).replace(/conic-gradient\([^;]*;/g, "");
      expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], path).toEqual([]);
    }
  });

  it("never follow the system's color scheme directly", () => {
    for (const path of stylesheets) {
      expect(read(path).includes("prefers-color-scheme"), path).toBe(false);
    }
  });

  it("stay under 500 lines each", () => {
    for (const path of stylesheets) {
      expect(read(path).split("\n").length, path).toBeLessThanOrEqual(500);
    }
  });
});

describe("the boot script", () => {
  const boot = (stored: string | null, systemDark: boolean) => {
    const properties: Record<string, string> = {};
    const root = { dataset: {} as Record<string, string>, style: { setProperty: (name: string, value: string) => (properties[name] = value) } };
    const window = { matchMedia: () => ({ matches: systemDark }), localStorage: { getItem: () => stored } };
    runInNewContext(read("public/theme-boot.js"), { document: { documentElement: root }, window });
    return { ...root.dataset, properties };
  };

  it("follows the system when no theme was chosen", () => {
    expect(boot(null, true)).toEqual({ base: "dark", properties: {} });
    expect(boot(null, false)).toEqual({ base: "light", properties: {} });
  });

  it("applies the saved theme before the app loads", () => {
    const applied = resolveTheme("snow", true);
    expect(boot(JSON.stringify(applied), true)).toEqual({ base: "light", theme: "snow", properties: applied.variables });
  });

  it("ignores a damaged entry and anything that isn't a color variable", () => {
    expect(boot("{not json", false)).toEqual({ base: "light", properties: {} });
    expect(boot(JSON.stringify({ id: "ember", base: "sideways", variables: {} }), true)).toEqual({ base: "dark", properties: {} });
    expect(boot(JSON.stringify({ id: "ember", base: "dark", variables: { "--ink": "#100c0a", "--ember": "url(x)", background: "#ffffff" } }), false).properties).toEqual({ "--ink": "#100c0a" });
  });
});
