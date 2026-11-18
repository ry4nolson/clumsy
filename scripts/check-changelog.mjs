#!/usr/bin/env node
// Fails when a released changelog section has gained entries since an earlier copy of the file.
// A branch cut before a release adds its entry next to lines that the release then stamps,
// and the merge puts the new entry under that version instead of [Unreleased].
// With --fix, moves those entries back under [Unreleased] (same ### heading) instead of failing.
// Usage: node scripts/check-changelog.mjs [--fix] <earlier-changelog-path> [changelog-path]
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const RELEASE = /^## \[(\d+\.\d+\.\d+)\][^\n]*$/;
const UNRELEASED = /^## \[Unreleased\]/i;
const isEntry = (line) => /^\s*[-*] /.test(line);

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
    } else if (current && isEntry(line)) {
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

function withoutEmptyHeadings(lines) {
  return lines.filter((line, index) => {
    if (!line.startsWith("### ")) {
      return true;
    }
    for (let next = index + 1; next < lines.length && !lines[next].startsWith("#"); next += 1) {
      if (lines[next].trim()) {
        return true;
      }
    }
    return false;
  });
}

function addToUnreleased(lines, moved) {
  const start = lines.findIndex((line) => UNRELEASED.test(line));
  if (start === -1) {
    return null;
  }
  let end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  end = end === -1 ? lines.length : end;
  const groups = new Map([["", []]]);
  let heading = "";
  for (const line of lines.slice(start + 1, end)) {
    if (line.startsWith("### ")) {
      heading = line.trim();
      groups.set(heading, groups.get(heading) ?? []);
    } else if (line.trim()) {
      groups.get(heading).push(line);
    }
  }
  for (const { heading: to, line } of moved) {
    groups.set(to, [...(groups.get(to) ?? []), line]);
  }
  const body = [];
  for (const [name, entries] of groups) {
    if (entries.length) {
      body.push(...(name ? [name] : []), ...entries, "");
    }
  }
  return [...lines.slice(0, start + 1), "", ...body, ...lines.slice(end)];
}

export function restoreUnreleased(earlier, current) {
  const misplaced = misplacedEntries(earlier, current);
  if (!misplaced.length) {
    return { content: current, moved: [] };
  }
  const wanted = new Set(misplaced.map(({ version, entry }) => `${version}\n${entry}`));
  const kept = [];
  const moved = [];
  let version = null;
  let heading = "";
  for (const line of current.split("\n")) {
    if (line.startsWith("## ")) {
      version = RELEASE.exec(line.trim())?.[1] ?? null;
      heading = "";
    } else if (line.startsWith("### ")) {
      heading = line.trim();
    } else if (version && isEntry(line) && wanted.has(`${version}\n${line.trim()}`)) {
      moved.push({ version, heading, line });
      continue;
    }
    kept.push(line);
  }
  const lines = addToUnreleased(withoutEmptyHeadings(kept), moved);
  if (!lines) {
    return { content: current, moved: [] };
  }
  return { content: lines.join("\n").replace(/\n{3,}/g, "\n\n"), moved: moved.map(({ version: from, line }) => ({ version: from, entry: line.trim() })) };
}

const shortened = (entry) => (entry.length > 100 ? `${entry.slice(0, 100)}…` : entry);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
  const [earlierPath, path = "CHANGELOG.md"] = args.filter((arg) => arg !== "--fix");
  if (!earlierPath) {
    console.error("Usage: check-changelog.mjs [--fix] <earlier-changelog-path> [changelog-path]");
    process.exit(1);
  }
  const earlier = readFileSync(earlierPath, "utf8");
  const current = readFileSync(path, "utf8");
  if (fix) {
    const { content, moved } = restoreUnreleased(earlier, current);
    if (moved.length) {
      writeFileSync(path, content);
      console.log("Moved these changelog entries from an already released version to [Unreleased]:");
      for (const { version, entry } of moved) {
        console.log(`  [${version}] ${shortened(entry)}`);
      }
    }
    process.exit(misplacedEntries(earlier, readFileSync(path, "utf8")).length ? 1 : 0);
  }
  const misplaced = misplacedEntries(earlier, current);
  if (misplaced.length) {
    console.error("These changelog entries were added under a version that is already released. Move them to [Unreleased]:");
    for (const { version, entry } of misplaced) {
      console.error(`  [${version}] ${shortened(entry)}`);
    }
    process.exit(1);
  }
}
