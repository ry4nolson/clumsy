import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { setNativeTheme } from "../lib/platform";
import { useSystemDarkMode } from "../lib/preferences";
import { THEME_EVENT, currentBase, readSystemDark, readThemeChoice, showTheme, watchThemeChoice, writeSystemDark, writeThemeChoice } from "../lib/themeStore";
import { resolveTheme, type ThemeChoice } from "../lib/themes";

const subscribeBase = (onChange: () => void) => {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
};

export const useThemeBase = () => useSyncExternalStore(subscribeBase, currentBase);

const SCHEME_QUERY = "(prefers-color-scheme: dark)";

export function useTheme() {
  const mediaDark = useSystemDarkMode();
  const [choice, setChoice] = useState(readThemeChoice);
  const [preview, setPreview] = useState<ThemeChoice | null>(null);
  const nativeForced = useRef(choice !== "system");
  const [systemDark, setSystemDark] = useState(() => (nativeForced.current ? (readSystemDark() ?? mediaDark) : mediaDark));

  const followSystem = useCallback((dark: boolean) => {
    writeSystemDark(dark);
    setSystemDark(dark);
  }, []);

  useEffect(() => {
    if (!nativeForced.current) {
      followSystem(mediaDark);
    }
  }, [mediaDark, followSystem]);

  useEffect(() => {
    if (choice !== "system") {
      nativeForced.current = true;
      void setNativeTheme(resolveTheme(choice, false).base);
      return;
    }
    let current = true;
    void setNativeTheme(null).then(() => {
      if (current) {
        nativeForced.current = false;
        followSystem(window.matchMedia(SCHEME_QUERY).matches);
      }
    });
    return () => {
      current = false;
    };
  }, [choice, followSystem]);

  const shown = resolveTheme(preview ?? choice, systemDark);
  const shownKey = `${shown.id ?? "system"}:${shown.base}`;
  useEffect(() => {
    showTheme(preview ?? choice, systemDark);
  }, [shownKey]);

  useEffect(() => watchThemeChoice(setChoice), []);

  const choose = useCallback(
    (next: ThemeChoice) => {
      writeThemeChoice(next, resolveTheme(next, systemDark));
      setPreview(null);
      setChoice(next);
    },
    [systemDark],
  );

  return { choice, base: resolveTheme(choice, systemDark).base, choose, preview: setPreview };
}
