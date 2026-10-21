import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM build script without type declarations
import { setCargoLockVersion, setCargoTomlVersion, setJsonVersion, setVersionFiles } from "../scripts/set-version.mjs";

describe("setVersion", () => {
  it("updates a JSON manifest version and keeps trailing newline formatting", () => {
    expect(setJsonVersion('{\n  "name": "clumsy",\n  "version": "0.1.0"\n}\n', "0.2.4")).toBe(
      '{\n  "name": "clumsy",\n  "version": "0.2.4"\n}\n',
    );
  });

  it("updates only the first Cargo.toml version line", () => {
    const toml = '[package]\nname = "clumsy"\nversion = "0.1.0"\n\n[dependencies]\nfoo = { version = "1.0.0" }\n';
    expect(setCargoTomlVersion(toml, "0.2.4")).toBe(
      '[package]\nname = "clumsy"\nversion = "0.2.4"\n\n[dependencies]\nfoo = { version = "1.0.0" }\n',
    );
  });

  it("updates the local clumsy package in Cargo.lock", () => {
    const lock = `[[package]]\nname = "clumsy"\nversion = "0.1.0"\ndependencies = [\n "tauri",\n]\n`;
    expect(setCargoLockVersion(lock, "0.2.4")).toBe(
      `[[package]]\nname = "clumsy"\nversion = "0.2.4"\ndependencies = [\n "tauri",\n]\n`,
    );
  });

  it("writes the same version into every release manifest", () => {
    const next = setVersionFiles(
      {
        "package.json": '{\n  "version": "0.1.0"\n}\n',
        "src-tauri/tauri.conf.json": '{\n  "version": "0.2.0"\n}\n',
        "src-tauri/Cargo.toml": 'version = "0.1.0"\n',
        "src-tauri/Cargo.lock": 'name = "clumsy"\nversion = "0.1.0"\n',
      },
      "0.2.4",
    );
    expect(JSON.parse(next["package.json"]).version).toBe("0.2.4");
    expect(JSON.parse(next["src-tauri/tauri.conf.json"]).version).toBe("0.2.4");
    expect(next["src-tauri/Cargo.toml"]).toContain('version = "0.2.4"');
    expect(next["src-tauri/Cargo.lock"]).toContain('version = "0.2.4"');
  });

  it("rejects a non-semver version", () => {
    expect(() => setVersionFiles({}, "v0.2.4")).toThrow(/X\.Y\.Z/);
  });
});
