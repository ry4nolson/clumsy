import { describe, expect, it } from "vitest";
import { isNewerVersion, parseChangelog, parseInline } from "../src/lib/changelog";

const sample = `# Changelog

Intro text that should be ignored.

## [Unreleased]

## [0.2.0] - 2026-11-01

### Added
- **Dark pages** keep images untouched
- Multi-line item that
  continues here

### Fixed
- Save no longer drops form values

## [0.1.0] - 2026-10-19

### Added
- Initial release
`;

describe("parseChangelog", () => {
  const releases = parseChangelog(sample);

  it("drops empty releases such as an empty Unreleased block", () => {
    expect(releases.map((release) => release.version)).toEqual(["0.2.0", "0.1.0"]);
  });

  it("captures dates and sections in order", () => {
    expect(releases[0].date).toBe("2026-11-01");
    expect(releases[0].sections.map((section) => section.title)).toEqual(["Added", "Fixed"]);
  });

  it("joins wrapped list items", () => {
    expect(releases[0].sections[0].items[1]).toBe("Multi-line item that continues here");
  });

  it("keeps a populated Unreleased block without a date", () => {
    const [unreleased] = parseChangelog("## [Unreleased]\n\n### Changed\n- Work in progress\n");
    expect(unreleased).toEqual({ version: "Unreleased", date: null, sections: [{ title: "Changed", items: ["Work in progress"] }] });
  });
});

describe("parseInline", () => {
  it("splits bold segments", () => {
    expect(parseInline("**Dark pages** keep images")).toEqual([
      { text: "Dark pages", bold: true },
      { text: " keep images", bold: false },
    ]);
  });

  it("leaves unmatched markers as text", () => {
    expect(parseInline("a ** b")).toEqual([{ text: "a ** b", bold: false }]);
  });
});

describe("isNewerVersion", () => {
  it("compares semantic versions numerically", () => {
    expect(isNewerVersion("0.10.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("v1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0", "1.0.1")).toBe(false);
    expect(isNewerVersion("1.0.1", "1.0")).toBe(true);
  });
});
