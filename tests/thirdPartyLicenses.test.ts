import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM build script without type declarations
import { chooseLicenses, fillMissingTexts, pickLicenseFile } from "../scripts/third-party-licenses.mjs";

describe("chooseLicenses", () => {
  it("prefers MIT among alternatives in any notation", () => {
    expect(chooseLicenses("Apache-2.0 OR MIT")).toEqual(["MIT"]);
    expect(chooseLicenses("MIT/Apache-2.0")).toEqual(["MIT"]);
    expect(chooseLicenses("Zlib OR Apache-2.0 OR MIT")).toEqual(["MIT"]);
    expect(chooseLicenses("Unlicense OR MIT")).toEqual(["MIT"]);
  });

  it("keeps every license joined with AND", () => {
    expect(chooseLicenses("(MIT OR Apache-2.0) AND Unicode-3.0")).toEqual(["MIT", "Unicode-3.0"]);
  });

  it("returns nothing for a missing expression", () => {
    expect(chooseLicenses(null)).toEqual([]);
  });
});

describe("pickLicenseFile", () => {
  const dual = ["Cargo.toml", "LICENSE-APACHE", "LICENSE-MIT", "README.md"];

  it("matches license files by name", () => {
    expect(pickLicenseFile(dual, "MIT", 1)).toBe("LICENSE-MIT");
    expect(pickLicenseFile(dual, "Apache-2.0", 1)).toBe("LICENSE-APACHE");
  });

  it("falls back to a single generic license file", () => {
    expect(pickLicenseFile(["LICENSE", "src"], "MPL-2.0", 1)).toBe("LICENSE");
    expect(pickLicenseFile(["LICENSE.md"], "MIT", 1)).toBe("LICENSE.md");
  });

  it("does not guess when a generic file could be either of two licenses", () => {
    expect(pickLicenseFile(["LICENSE", "COPYING"], "Unicode-3.0", 2)).toBeNull();
  });
});

describe("fillMissingTexts", () => {
  const entry = (name: string, chosen: string[], found: Array<{ id: string; text: string | null }>, authors: string[] = []) => ({
    name,
    authors,
    licenses: { chosen, found, notices: [] },
  });

  it("reuses a shared Apache text and templates MIT with the crate authors", () => {
    const [, apacheless, mitless] = fillMissingTexts([
      entry("has-apache", ["Apache-2.0"], [{ id: "Apache-2.0", text: "APACHE TEXT" }]),
      entry("no-apache", ["Apache-2.0"], [{ id: "Apache-2.0", text: null }]),
      entry("no-mit", ["MIT"], [{ id: "MIT", text: null }], ["Ada Lovelace"]),
    ]);
    expect(apacheless.texts.texts).toEqual(["APACHE TEXT"]);
    expect(mitless.texts.texts[0]).toContain("Copyright (c) Ada Lovelace");
  });

  it("names the project when a crate lists no authors", () => {
    const [result] = fillMissingTexts([entry("lonely", ["MIT"], [{ id: "MIT", text: null }])]);
    expect(result.texts.texts[0]).toContain("Copyright (c) the lonely developers");
  });
});
