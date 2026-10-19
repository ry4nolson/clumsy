import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM build script without type declarations
import { stampChangelog } from "../scripts/stamp-changelog.mjs";
import { parseChangelog } from "../src/lib/changelog";

const header = "# Changelog\n\nIntro.\n\n";
const released = "## [0.1.0] - 2026-10-19\n\n### Added\n- First release\n";

describe("stampChangelog", () => {
  it("moves unreleased entries under the new version and leaves an empty Unreleased", () => {
    const input = `${header}## [Unreleased]\n\n### Added\n- **Tabs**\n\n### Fixed\n- A bug\n\n${released}`;
    const { content, notes } = stampChangelog(input, "0.2.0", "2026-11-01");
    expect(notes).toBe("### Added\n- **Tabs**\n\n### Fixed\n- A bug");
    expect(content).toBe(
      `${header}## [Unreleased]\n\n## [0.2.0] - 2026-11-01\n\n### Added\n- **Tabs**\n\n### Fixed\n- A bug\n\n${released}`,
    );
    expect(parseChangelog(content).map((release) => release.version)).toEqual(["0.2.0", "0.1.0"]);
  });

  it("does nothing when Unreleased has no entries", () => {
    const input = `${header}## [Unreleased]\n\n${released}`;
    expect(stampChangelog(input, "0.2.0", "2026-11-01")).toEqual({ content: input, notes: "" });
  });

  it("does nothing without an Unreleased heading", () => {
    expect(stampChangelog(`${header}${released}`, "0.2.0", "2026-11-01").notes).toBe("");
  });

  it("handles Unreleased as the only section", () => {
    const { content } = stampChangelog(`${header}## [Unreleased]\n\n### Added\n- Thing\n`, "0.1.0", "2026-10-19");
    expect(content).toBe(`${header}## [Unreleased]\n\n## [0.1.0] - 2026-10-19\n\n### Added\n- Thing\n`);
  });
});
