#!/usr/bin/env node
// Writes the same version into package.json, tauri.conf.json, Cargo.toml, and Cargo.lock.
// Usage: node scripts/set-version.mjs <version>
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+$/;

export function setJsonVersion(content, version) {
  const data = JSON.parse(content);
  data.version = version;
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function setCargoTomlVersion(content, version) {
  if (!/^version = "[^"]+"/m.test(content)) {
    throw new Error("Cargo.toml has no package version line");
  }
  return content.replace(/^version = "[^"]+"/m, `version = "${version}"`);
}

export function setCargoLockVersion(content, version) {
  const next = content.replace(
    /(^name = "clumsy"\n)version = "[^"]+"/m,
    `$1version = "${version}"`,
  );
  if (next === content) {
    throw new Error('Cargo.lock has no local "clumsy" package version');
  }
  return next;
}

export function setVersionFiles(files, version) {
  if (!SEMVER.test(version)) {
    throw new Error(`Version must be X.Y.Z, got ${version}`);
  }
  return {
    "package.json": setJsonVersion(files["package.json"], version),
    "src-tauri/tauri.conf.json": setJsonVersion(files["src-tauri/tauri.conf.json"], version),
    "src-tauri/Cargo.toml": setCargoTomlVersion(files["src-tauri/Cargo.toml"], version),
    "src-tauri/Cargo.lock": setCargoLockVersion(files["src-tauri/Cargo.lock"], version),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: set-version.mjs <version>");
    process.exit(1);
  }
  const paths = ["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
  const files = Object.fromEntries(paths.map((path) => [path, readFileSync(path, "utf8")]));
  const next = setVersionFiles(files, version);
  for (const path of paths) {
    writeFileSync(path, next[path]);
  }
  console.log(version);
}
