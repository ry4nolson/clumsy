#!/usr/bin/env node
// Fails when a released changelog section has gained entries since an earlier copy of the file.
// A branch cut before a release adds its entry next to lines that the release then stamps,
// and the merge puts the new entry under that version instead of [Unreleased].
// Usage: node scripts/check-changelog.mjs <earlier-changelog-path> [changelog-path]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const RELEASE = /^## \[(\d+\.\d+\.\d+)\][^\n]*$/;

export function releasedEntries(content) {
  const sections = new Map();
  let current = null;
  for (const line of content.split("\n")) {
    if (line.startsWith("## ")) {
      const version = RELEASE.exec(line.trim())?.[1];
      current = version ? [] : null;
      if (version) {
        sections.set(version, current);
      }
    } else if (current && /^\s*[-*] /.test(line)) {
      current.push(line.trim());
    }
  }
  return sections;
}

export function misplacedEntries(earlier, current) {
  const before = releasedEntries(earlier);
  const misplaced = [];
  for (const [version, entries] of releasedEntries(current)) {
    const known = before.get(version);
    if (known && entries.length > known.length) {
      misplaced.push(...entries.filter((entry) => !known.includes(entry)).map((entry) => ({ version, entry })));
    }
  }
  return misplaced;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [earlierPath, path = "CHANGELOG.md"] = process.argv.slice(2);
  if (!earlierPath) {
    console.error("Usage: check-changelog.mjs <earlier-changelog-path> [changelog-path]");
    process.exit(1);
  }
  const misplaced = misplacedEntries(readFileSync(earlierPath, "utf8"), readFileSync(path, "utf8"));
  if (misplaced.length) {
    console.error("These changelog entries were added under a version that is already released. Move them to [Unreleased]:");
    for (const { version, entry } of misplaced) {
      console.error(`  [${version}] ${entry.length > 100 ? `${entry.slice(0, 100)}…` : entry}`);
    }
    process.exit(1);
  }
}
