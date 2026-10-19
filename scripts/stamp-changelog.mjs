#!/usr/bin/env node
// Moves the [Unreleased] changelog section under a release heading.
// Usage: node scripts/stamp-changelog.mjs <version> <yyyy-mm-dd> [changelog-path]
// Prints the released section (the release notes); prints nothing when [Unreleased] is empty.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const UNRELEASED = /^## \[Unreleased\][^\n]*\n/im;

export function stampChangelog(content, version, date) {
  const match = UNRELEASED.exec(content);
  if (!match) {
    return { content, notes: "" };
  }
  const bodyStart = match.index + match[0].length;
  const nextHeading = content.slice(bodyStart).search(/^## \[/m);
  const bodyEnd = nextHeading === -1 ? content.length : bodyStart + nextHeading;
  const body = content.slice(bodyStart, bodyEnd).trim();
  if (!/^\s*[-*] /m.test(body)) {
    return { content, notes: "" };
  }
  const rest = content.slice(bodyEnd);
  const stamped = `${content.slice(0, match.index)}## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n${rest ? `\n${rest}` : ""}`;
  return { content: stamped, notes: body };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [version, date, path = "CHANGELOG.md"] = process.argv.slice(2);
  if (!version || !date) {
    console.error("Usage: stamp-changelog.mjs <version> <yyyy-mm-dd> [changelog-path]");
    process.exit(1);
  }
  const { content, notes } = stampChangelog(readFileSync(path, "utf8"), version, date);
  if (notes) {
    writeFileSync(path, content);
    process.stdout.write(`${notes}\n`);
  }
}
