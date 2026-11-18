import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM build script without type declarations
import { misplacedEntries, releasedEntries, restoreUnreleased } from "../scripts/check-changelog.mjs";

const changelog = (unreleased: string, released: string) => `# Changelog\n\n## [Unreleased]\n\n${unreleased}\n## [0.16.0] - 2026-11-13\n\n${released}\n## [0.15.1] - 2026-11-13\n\n### Changed\n- Sidebar\n`;

describe("releasedEntries", () => {
  it("lists the entries under each released version and skips Unreleased", () => {
    const sections = releasedEntries(changelog("### Added\n- New\n", "### Fixed\n- A bug\n\n### Added\n* Forms\n"));
    expect([...sections]).toEqual([
      ["0.16.0", ["- A bug", "* Forms"]],
      ["0.15.1", ["- Sidebar"]],
    ]);
  });
});

describe("misplacedEntries", () => {
  const before = changelog("", "### Added\n- Forms\n");

  it("finds an entry merged into a released section", () => {
    const merged = changelog("", "### Added\n- Compress\n- Forms\n");
    expect(misplacedEntries(before, merged)).toEqual([{ version: "0.16.0", entry: "- Compress" }]);
  });

  it("accepts new entries under Unreleased and new release sections", () => {
    expect(misplacedEntries(before, changelog("### Added\n- Compress\n", "### Added\n- Forms\n"))).toEqual([]);
    const stamped = before.replace("## [0.16.0]", "## [0.16.1] - 2026-11-14\n\n### Added\n- Compress\n\n## [0.16.0]");
    expect(misplacedEntries(before, stamped)).toEqual([]);
  });

  it("accepts rewording or removing a released entry", () => {
    expect(misplacedEntries(before, changelog("", "### Added\n- Form calculations\n"))).toEqual([]);
    expect(misplacedEntries(before, changelog("", ""))).toEqual([]);
  });

  it("ignores a version the earlier file doesn't have", () => {
    expect(misplacedEntries("# Changelog\n\n## [Unreleased]\n", before)).toEqual([]);
  });
});

describe("restoreUnreleased", () => {
  const before = changelog("", "### Added\n- Forms\n");

  it("moves a misplaced entry under the same heading in Unreleased and drops the emptied heading", () => {
    const merged = changelog("", "### Added\n- Forms\n\n### Changed\n- Icons\n");
    const { content, moved } = restoreUnreleased(before, merged);
    expect(moved).toEqual([{ version: "0.16.0", entry: "- Icons" }]);
    expect(content).toBe(changelog("### Changed\n- Icons\n", "### Added\n- Forms\n"));
    expect(misplacedEntries(before, content)).toEqual([]);
  });

  it("joins an existing Unreleased heading and keeps the other headings in order", () => {
    const merged = changelog("### Added\n- Compress\n\n### Fixed\n- Crash\n", "### Added\n- Layers\n- Forms\n");
    const { content } = restoreUnreleased(before, merged);
    expect(content).toBe(changelog("### Added\n- Compress\n- Layers\n\n### Fixed\n- Crash\n", "### Added\n- Forms\n"));
  });

  it("leaves a correct changelog alone", () => {
    const fine = changelog("### Added\n- Compress\n", "### Added\n- Forms\n");
    expect(restoreUnreleased(before, fine)).toEqual({ content: fine, moved: [] });
  });
});
