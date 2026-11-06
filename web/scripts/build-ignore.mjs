import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SITE_PATHS = ["web/", "src/lib/changelog.ts"];

export function minorOf(version) {
  return version.split(".").slice(0, 2).join(".");
}

export function needsBuild(changedFiles, before, after) {
  return (
    minorOf(before) !== minorOf(after) ||
    changedFiles.some((file) => SITE_PATHS.some((path) => file.startsWith(path)))
  );
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function versionAt(ref) {
  return JSON.parse(git("show", `${ref}:src-tauri/tauri.conf.json`)).version;
}

function shouldBuild({ CACHED_COMMIT_REF: from, COMMIT_REF: to }) {
  if (!from || !to || from === to) return true;
  try {
    const changed = git("diff", "--name-only", from, to).split("\n").filter(Boolean);
    return needsBuild(changed, versionAt(from), versionAt(to));
  } catch {
    return true;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(shouldBuild(process.env) ? 1 : 0);
}
