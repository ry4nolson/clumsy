import { describe, expect, it } from "vitest";
import {
  newerReleases,
  releaseNotesFromBody,
  shouldAutoCheck,
  shouldPromptForUpdate,
  type GitHubRelease,
} from "../src/lib/updates";

const release = (tag: string, body: string, extras: Partial<GitHubRelease> = {}): GitHubRelease => ({
  tag_name: tag,
  html_url: `https://github.com/ry4nolson/clumsy/releases/tag/${tag}`,
  body,
  draft: false,
  prerelease: false,
  published_at: "2026-10-21T12:00:00Z",
  ...extras,
});

describe("releaseNotesFromBody", () => {
  it("parses Keep a Changelog sections from a GitHub release body", () => {
    expect(
      releaseNotesFromBody(
        "0.2.8",
        "2026-10-21",
        "### Changed\n- Branded disk image\n\n**Full changelog:** https://example.com\n",
      ),
    ).toEqual({
      version: "0.2.8",
      date: "2026-10-21",
      sections: [{ title: "Changed", items: ["Branded disk image"] }],
    });
  });

  it("wraps flat commit lists in a Changes section", () => {
    expect(releaseNotesFromBody("0.2.0", null, "- Fix save\n- Tweak zoom\n").sections).toEqual([
      { title: "Changes", items: ["Fix save", "Tweak zoom"] },
    ]);
  });
});

describe("newerReleases", () => {
  it("returns every release newer than the installed version, newest first", () => {
    const available = newerReleases("0.2.5", [
      release("v0.2.8", "### Changed\n- Disk image\n"),
      release("v0.2.7", "### Fixed\n- DMG busy\n"),
      release("v0.2.5", "### Fixed\n- Opener allowlist\n"),
      release("v0.2.4", "### Added\n- Palette\n"),
    ]);

    expect(available?.latest).toBe("0.2.8");
    expect(available?.releases.map((entry) => entry.version)).toEqual(["0.2.8", "0.2.7"]);
    expect(available?.releases[1].sections[0].items).toEqual(["DMG busy"]);
  });

  it("ignores drafts and prereleases", () => {
    expect(
      newerReleases("0.2.0", [
        release("v0.3.0", "### Added\n- Soon\n", { prerelease: true }),
        release("v0.2.1", "### Fixed\n- Bug\n", { draft: true }),
      ]),
    ).toBeNull();
  });

  it("returns null when already current", () => {
    expect(newerReleases("0.2.8", [release("v0.2.8", "### Changed\n- Same\n")])).toBeNull();
  });
});

describe("shouldPromptForUpdate", () => {
  const available = {
    state: "available" as const,
    latest: "0.3.0",
    url: "https://example.com",
    releases: [],
  };

  it("skips the current latest and older skipped versions", () => {
    expect(shouldPromptForUpdate(available, { skipped: "0.3.0" }, 1)).toBe(false);
    expect(shouldPromptForUpdate(available, { skipped: "0.4.0" }, 1)).toBe(false);
    expect(shouldPromptForUpdate({ ...available, latest: "0.3.1" }, { skipped: "0.3.0" }, 1)).toBe(true);
  });

  it("honors snooze", () => {
    expect(shouldPromptForUpdate(available, { snoozedUntil: 100 }, 50)).toBe(false);
    expect(shouldPromptForUpdate(available, { snoozedUntil: 100 }, 101)).toBe(true);
  });
});

describe("shouldAutoCheck", () => {
  it("checks when never checked or the interval has elapsed", () => {
    expect(shouldAutoCheck(null, 1000, 500)).toBe(true);
    expect(shouldAutoCheck(100, 599, 500)).toBe(false);
    expect(shouldAutoCheck(100, 600, 500)).toBe(true);
  });
});
