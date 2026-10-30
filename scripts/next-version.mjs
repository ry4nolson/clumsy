#!/usr/bin/env node
// Prints the next release version.
// Bumps the latest vX.Y.Z tag: minor when [Unreleased] has an Added entry, otherwise patch.
// A higher version in tauri.conf.json wins (edit it to jump to a new major release).
// Usage: node scripts/next-version.mjs [changelog-path] [tauri-conf-path]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { unreleasedSection } from "./stamp-changelog.mjs";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function parts(version) {
  const match = SEMVER.exec(version);
  if (!match) {
    throw new Error(`Not a version: ${version}`);
  }
  return match.slice(1).map(Number);
}

export function compareVersions(a, b) {
  const [left, right] = [parts(a), parts(b)];
  return left.map((part, index) => part - right[index]).find((difference) => difference !== 0) ?? 0;
}

export function releaseBump(changelog) {
  const body = unreleasedSection(changelog)?.body ?? "";
  const added = /^### Added[^\n]*\n([\s\S]*?)(?=^### |(?![\s\S]))/im.exec(body);
  return added && /^\s*[-*] /m.test(added[1]) ? "minor" : "patch";
}

export function nextVersion({ latestTag, configVersion, changelog }) {
  const latest = latestTag?.replace(/^v/, "");
  if (!latest || compareVersions(configVersion, latest) > 0) {
    return configVersion;
  }
  const [major, minor, patch] = parts(latest);
  return releaseBump(changelog) === "minor" ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
}

function latestTag() {
  return execFileSync("git", ["tag", "--list", "v[0-9]*.[0-9]*.[0-9]*", "--sort=-v:refname"], { encoding: "utf8" })
    .split("\n")
    .find((tag) => SEMVER.test(tag.replace(/^v/, "")));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [changelogPath = "CHANGELOG.md", configPath = "src-tauri/tauri.conf.json"] = process.argv.slice(2);
  const configVersion = JSON.parse(readFileSync(configPath, "utf8")).version;
  process.stdout.write(`${nextVersion({ latestTag: latestTag(), configVersion, changelog: readFileSync(changelogPath, "utf8") })}\n`);
}
