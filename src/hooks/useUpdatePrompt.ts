import { useEffect, useRef, useState } from "react";
import { isMainWindow } from "../lib/documentWindows";
import { isDesktop, openExternal } from "../lib/platform";
import { usePersistentState } from "../lib/preferences";
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_SNOOZE_MS,
  checkForUpdates,
  shouldAutoCheck,
  shouldPromptForUpdate,
  type UpdateAvailable,
  type UpdatePromptPreference,
} from "../lib/updates";

const LAST_CHECK_KEY = "clumsy.updateCheckAt";

function readLastCheckAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_CHECK_KEY);
    if (raw === null) {
      return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeLastCheckAt(now: number) {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(now));
  } catch {
    return;
  }
}

export function useUpdatePrompt() {
  const [preference, setPreference] = usePersistentState<UpdatePromptPreference>("clumsy.updatePrompt", null);
  const [offer, setOffer] = useState<UpdateAvailable | null>(null);
  const preferenceRef = useRef(preference);
  const offerRef = useRef(offer);
  preferenceRef.current = preference;
  offerRef.current = offer;

  useEffect(() => {
    if (!isDesktop || !isMainWindow()) {
      return;
    }

    let busy = false;
    let disposed = false;

    const run = async (force: boolean) => {
      if (busy || disposed || document.visibilityState !== "visible" || offerRef.current) {
        return;
      }
      const now = Date.now();
      if (!force && !shouldAutoCheck(readLastCheckAt(), now, UPDATE_CHECK_INTERVAL_MS)) {
        return;
      }
      busy = true;
      writeLastCheckAt(now);
      try {
        const status = await checkForUpdates();
        if (disposed || status.state !== "available") {
          return;
        }
        if (shouldPromptForUpdate(status, preferenceRef.current, Date.now())) {
          setOffer(status);
        }
      } finally {
        busy = false;
      }
    };

    const onFocus = () => {
      void run(false);
    };

    const timer = window.setTimeout(() => {
      void run(true);
    }, 2000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  const clearOffer = () => setOffer(null);

  return {
    offer,
    later: () => {
      setPreference({ ...preferenceRef.current, snoozedUntil: Date.now() + UPDATE_SNOOZE_MS });
      clearOffer();
    },
    skip: () => {
      if (offerRef.current) {
        setPreference({ skipped: offerRef.current.latest });
      }
      clearOffer();
    },
    download: () => {
      if (offerRef.current) {
        openExternal(offerRef.current.url);
      }
      clearOffer();
    },
  };
}
