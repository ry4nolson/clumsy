import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM build script without type declarations
import { updateManifest } from "../scripts/update-manifest.mjs";

describe("updateManifest", () => {
  it("points both Mac architectures at the universal archive", () => {
    const manifest = updateManifest({
      version: "0.8.0",
      signature: "c2lnbmF0dXJl\n",
      notes: "### Added\n- Updates\n\n**Full changelog:** https://example.com/compare\n",
      repoUrl: "https://github.com/ry4nolson/clumsy",
      pubDate: "2026-10-30T12:00:00Z",
    });
    const entry = {
      signature: "c2lnbmF0dXJl",
      url: "https://github.com/ry4nolson/clumsy/releases/download/v0.8.0/Clumsy.app.tar.gz",
    };
    expect(manifest).toEqual({
      version: "0.8.0",
      notes: "### Added\n- Updates",
      pub_date: "2026-10-30T12:00:00Z",
      platforms: { "darwin-aarch64": entry, "darwin-x86_64": entry },
    });
  });
});
