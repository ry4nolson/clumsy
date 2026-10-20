import { useEffect, useRef } from "react";
import { SNOOZE_MS, shouldPromptForDefault, type DefaultAppPreference } from "../lib/defaultApp";
import { promptForDefaultApp } from "../lib/defaultAppPrompt";
import { isMainWindow } from "../lib/documentWindows";
import { getDefaultAppStatus, isDesktop } from "../lib/platform";
import { usePersistentState } from "../lib/preferences";

export function useDefaultAppPrompt() {
  const [preference, setPreference] = usePersistentState<DefaultAppPreference>("clumsy.defaultAppPrompt", null);
  const preferenceRef = useRef(preference);
  preferenceRef.current = preference;

  useEffect(() => {
    if (!isDesktop || !isMainWindow()) {
      return;
    }
    const timer = window.setTimeout(async () => {
      const status = await getDefaultAppStatus();
      if (!shouldPromptForDefault(status, preferenceRef.current, Date.now())) {
        return;
      }
      const choice = await promptForDefaultApp(status, "launch");
      if (choice === "never") {
        setPreference({ state: "never" });
      } else if (choice === "declined") {
        setPreference({ state: "snoozed", until: Date.now() + SNOOZE_MS });
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);
}

export async function requestDefaultApp() {
  await promptForDefaultApp(await getDefaultAppStatus(), "manual");
}
