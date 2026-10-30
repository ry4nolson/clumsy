import { useCallback, useRef, useState } from "react";
import { installUpdate } from "../lib/platform";
import { NOT_INSTALLABLE, installFailure, isInstalling, type InstallState } from "../lib/updates";

export type UpdateInstall = ReturnType<typeof useUpdateInstall>;

export function useUpdateInstall() {
  const [install, setInstall] = useState<InstallState>({ state: "idle" });
  const installRef = useRef(install);
  installRef.current = install;

  const start = useCallback(async () => {
    if (isInstalling(installRef.current)) {
      return;
    }
    let finished = false;
    setInstall({ state: "downloading", received: 0, total: null });
    try {
      const version = await installUpdate((progress) => {
        if (!finished) {
          setInstall(progress);
        }
      });
      finished = true;
      setInstall(version ? { state: "installed", version } : { state: "failed", message: NOT_INSTALLABLE });
    } catch (error) {
      finished = true;
      setInstall({ state: "failed", message: installFailure(error) });
    }
  }, []);

  const dismissFailure = useCallback(() => {
    setInstall((current) => (current.state === "failed" ? { state: "idle" } : current));
  }, []);

  return { install, start, dismissFailure };
}
