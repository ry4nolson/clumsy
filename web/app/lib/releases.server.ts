import bundled from "../../../CHANGELOG.md?raw";
import { parseChangelog } from "../../../src/lib/changelog";
import { remoteContent } from "./remote.server";

function released(changelog: string) {
  const releases = parseChangelog(changelog).filter((release) => release.version !== "Unreleased");
  return releases.length ? releases : null;
}

export const loadReleases = remoteContent("CHANGELOG.md", released, released(bundled) ?? []);

export async function latestVersion() {
  const [latest] = await loadReleases();
  return latest?.version ?? "";
}
