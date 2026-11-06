import { describe, expect, it } from "vitest";
import { minorOf, needsBuild } from "./build-ignore.mjs";

describe("minorOf", () => {
  it("drops the patch", () => {
    expect(minorOf("0.11.3")).toBe("0.11");
    expect(minorOf("1.0.0")).toBe("1.0");
  });
});

describe("needsBuild", () => {
  it("skips patch releases", () => {
    expect(needsBuild(["CHANGELOG.md", "src-tauri/tauri.conf.json"], "0.11.0", "0.11.1")).toBe(false);
  });

  it("skips app changes that don't touch the site", () => {
    expect(needsBuild(["src/App.tsx", "CHANGELOG.md"], "0.11.1", "0.11.1")).toBe(false);
  });

  it("builds minor and major releases", () => {
    expect(needsBuild(["CHANGELOG.md"], "0.11.4", "0.12.0")).toBe(true);
    expect(needsBuild(["CHANGELOG.md"], "0.12.2", "1.0.0")).toBe(true);
  });

  it("builds when the site or its changelog parser changes", () => {
    expect(needsBuild(["web/app/app.css"], "0.11.1", "0.11.1")).toBe(true);
    expect(needsBuild(["src/lib/changelog.ts"], "0.11.1", "0.11.2")).toBe(true);
  });
});
