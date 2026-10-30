import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM build script without type declarations
import { compareVersions, nextVersion, releaseBump } from "../scripts/next-version.mjs";

const header = "# Changelog\n\n";
const released = "## [0.4.2] - 2026-10-30\n\n### Added\n- Old feature\n";
const changelog = (unreleased: string) => `${header}## [Unreleased]\n\n${unreleased}\n${released}`;

describe("releaseBump", () => {
  it("is minor when Unreleased has an Added entry", () => {
    expect(releaseBump(changelog("### Added\n- **Export**\n\n### Fixed\n- A bug\n"))).toBe("minor");
    expect(releaseBump(changelog("### Fixed\n- A bug\n\n### Added\n- **Export**\n"))).toBe("minor");
  });

  it("is patch for fixes, changes, and removals only", () => {
    expect(releaseBump(changelog("### Fixed\n- A bug\n\n### Changed\n- Wording\n\n### Removed\n- Old thing\n"))).toBe("patch");
  });

  it("is patch when Added is empty or Unreleased has nothing", () => {
    expect(releaseBump(changelog("### Added\n\n### Fixed\n- A bug\n"))).toBe("patch");
    expect(releaseBump(changelog(""))).toBe("patch");
    expect(releaseBump(`${header}${released}`)).toBe("patch");
  });

  it("ignores Added sections in released versions", () => {
    expect(releaseBump(changelog("### Fixed\n- A bug\n"))).toBe("patch");
  });
});

describe("nextVersion", () => {
  const fixes = changelog("### Fixed\n- A bug\n");
  const features = changelog("### Added\n- **Export**\n");

  it("bumps the patch for fixes", () => {
    expect(nextVersion({ latestTag: "v0.4.2", configVersion: "0.4.2", changelog: fixes })).toBe("0.4.3");
  });

  it("bumps the minor and resets the patch for features", () => {
    expect(nextVersion({ latestTag: "v0.4.2", configVersion: "0.4.2", changelog: features })).toBe("0.5.0");
    expect(nextVersion({ latestTag: "v1.9.4", configVersion: "1.9.4", changelog: features })).toBe("1.10.0");
  });

  it("uses a higher tauri.conf.json version as is", () => {
    expect(nextVersion({ latestTag: "v0.9.3", configVersion: "1.0.0", changelog: fixes })).toBe("1.0.0");
  });

  it("ignores a config version that isn't ahead of the latest tag", () => {
    expect(nextVersion({ latestTag: "v0.10.0", configVersion: "0.9.0", changelog: fixes })).toBe("0.10.1");
  });

  it("uses the config version when there are no tags", () => {
    expect(nextVersion({ latestTag: undefined, configVersion: "0.1.0", changelog: features })).toBe("0.1.0");
  });
});

describe("compareVersions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3", "1.3.0")).toBeLessThan(0);
  });
});
