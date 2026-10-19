import { useCallback, useState } from "react";
import { isNewerVersion } from "./changelog";

export const repoUrl = "https://github.com/ry4nolson/clumsy";
export const appVersion = __APP_VERSION__;

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "current"; latest: string }
  | { state: "available"; latest: string; url: string }
  | { state: "error"; message: string };

export function releaseUrl(version: string) {
  return `${repoUrl}/releases/tag/v${version}`;
}

export function useUpdateCheck() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });

  const check = useCallback(async () => {
    setStatus({ state: "checking" });
    try {
      const response = await fetch("https://api.github.com/repos/ry4nolson/clumsy/releases/latest", {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404) {
        setStatus({ state: "error", message: "No public releases found" });
        return;
      }
      if (!response.ok) {
        setStatus({ state: "error", message: `GitHub returned ${response.status}` });
        return;
      }
      const release = (await response.json()) as { tag_name?: string; html_url?: string };
      const latest = (release.tag_name ?? "").replace(/^v/, "");
      setStatus(
        isNewerVersion(latest, appVersion)
          ? { state: "available", latest, url: release.html_url ?? releaseUrl(latest) }
          : { state: "current", latest },
      );
    } catch {
      setStatus({ state: "error", message: "Couldn't reach GitHub" });
    }
  }, []);

  return { status, check };
}
