import { useCallback, useState } from "react";
import { isNewerVersion, parseChangelog, type ChangelogRelease } from "./changelog";

export const repoUrl = "https://github.com/ry4nolson/clumsy";
export const appVersion = __APP_VERSION__;
export const releasesApiUrl = `${repoUrl.replace("https://github.com", "https://api.github.com/repos")}/releases?per_page=30`;

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_SNOOZE_MS = 24 * 60 * 60 * 1000;

export type GitHubRelease = {
  tag_name: string;
  html_url: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
};

export type UpdateAvailable = {
  state: "available";
  latest: string;
  url: string;
  releases: ChangelogRelease[];
};

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "current"; latest: string }
  | UpdateAvailable
  | { state: "error"; message: string };

export type UpdateProgress = { state: "downloading"; received: number; total: number | null } | { state: "installing" };

export type InstallState =
  | { state: "idle" }
  | UpdateProgress
  | { state: "installed"; version: string }
  | { state: "failed"; message: string };

export function isInstalling(install: InstallState) {
  return install.state === "downloading" || install.state === "installing";
}

export function installProgress(install: InstallState): { label: string; value?: number } | null {
  if (install.state === "installing") {
    return { label: "Installing…" };
  }
  if (install.state !== "downloading") {
    return null;
  }
  if (install.total) {
    const value = Math.min(1, install.received / install.total);
    return { label: `Downloading… ${Math.floor(value * 100)}%`, value };
  }
  return { label: install.received ? `Downloading… ${(install.received / 1_000_000).toFixed(1)} MB` : "Downloading…" };
}

export function installFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message ? `Couldn’t install the update: ${message}` : "Couldn’t install the update";
}

export const NOT_INSTALLABLE = "This release can’t be installed from inside Clumsy. Download it instead.";

export type UpdatePromptPreference = {
  skipped?: string;
  snoozedUntil?: number;
} | null;

export function releaseUrl(version: string) {
  return `${repoUrl}/releases/tag/v${version}`;
}

export function releaseNotesFromBody(version: string, date: string | null, body: string): ChangelogRelease {
  const cleaned = body.replace(/\n*\*\*Full changelog:\*\*[^\n]*/gi, "").trim();
  const heading = `## [${version}]${date ? ` - ${date}` : ""}`;
  const markdown = cleaned.includes("### ")
    ? `${heading}\n\n${cleaned}`
    : `${heading}\n\n### Changes\n${cleaned || "- No release notes"}\n`;
  return parseChangelog(markdown)[0] ?? { version, date, sections: [] };
}

export function newerReleases(current: string, releases: GitHubRelease[]): UpdateAvailable | null {
  const newer = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => {
      const version = release.tag_name.replace(/^v/, "");
      return {
        version,
        url: release.html_url || releaseUrl(version),
        date: release.published_at?.slice(0, 10) ?? null,
        body: release.body ?? "",
      };
    })
    .filter((release) => isNewerVersion(release.version, current))
    .sort((a, b) => (isNewerVersion(a.version, b.version) ? -1 : isNewerVersion(b.version, a.version) ? 1 : 0));

  if (!newer.length) {
    return null;
  }

  return {
    state: "available",
    latest: newer[0].version,
    url: newer[0].url,
    releases: newer.map((release) => releaseNotesFromBody(release.version, release.date, release.body)),
  };
}

export function shouldPromptForUpdate(available: UpdateAvailable, preference: UpdatePromptPreference, now: number) {
  if (preference?.skipped && !isNewerVersion(available.latest, preference.skipped)) {
    return false;
  }
  return !(preference?.snoozedUntil && preference.snoozedUntil > now);
}

export function shouldAutoCheck(lastCheckAt: number | null, now: number, intervalMs = UPDATE_CHECK_INTERVAL_MS) {
  return lastCheckAt === null || now - lastCheckAt >= intervalMs;
}

export async function checkForUpdates(current = appVersion): Promise<Exclude<UpdateStatus, { state: "idle" | "checking" }>> {
  try {
    const response = await fetch(releasesApiUrl, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) {
      return { state: "error", message: "No public releases found" };
    }
    if (!response.ok) {
      return { state: "error", message: `GitHub returned ${response.status}` };
    }
    const releases = (await response.json()) as GitHubRelease[];
    const available = newerReleases(current, releases);
    if (available) {
      return available;
    }
    const latest = releases.find((release) => !release.draft && !release.prerelease)?.tag_name?.replace(/^v/, "") ?? current;
    return { state: "current", latest };
  } catch {
    return { state: "error", message: "Couldn't reach GitHub" };
  }
}

export function useUpdateCheck() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });

  const check = useCallback(async () => {
    setStatus({ state: "checking" });
    setStatus(await checkForUpdates());
  }, []);

  return { status, check };
}
