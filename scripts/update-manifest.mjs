#!/usr/bin/env node
// Writes the updater manifest (latest.json) for a release.
// Usage: node scripts/update-manifest.mjs <version> <signature-file> <notes-file> <repo-url> > latest.json
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const UPDATE_ARCHIVE = "Clumsy.app.tar.gz";
export const UPDATE_PLATFORMS = ["darwin-aarch64", "darwin-x86_64"];

export function updateManifest({ version, signature, notes, repoUrl, pubDate }) {
  const url = `${repoUrl}/releases/download/v${version}/${UPDATE_ARCHIVE}`;
  return {
    version,
    notes: notes.replace(/\n*\*\*Full changelog:\*\*[^\n]*/gi, "").trim(),
    pub_date: pubDate,
    platforms: Object.fromEntries(UPDATE_PLATFORMS.map((platform) => [platform, { signature: signature.trim(), url }])),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version, signatureFile, notesFile, repoUrl] = process.argv.slice(2);
  if (!version || !signatureFile || !notesFile || !repoUrl) {
    console.error("Usage: node scripts/update-manifest.mjs <version> <signature-file> <notes-file> <repo-url>");
    process.exit(1);
  }
  const manifest = updateManifest({
    version,
    signature: readFileSync(signatureFile, "utf8"),
    notes: readFileSync(notesFile, "utf8"),
    repoUrl: repoUrl.replace(/\/$/, ""),
    pubDate: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
