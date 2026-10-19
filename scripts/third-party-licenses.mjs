#!/usr/bin/env node
// Generates public/third-party-licenses.txt: license texts for every npm package
// bundled into the UI and every Rust crate compiled into the app binary.
// Usage: node scripts/third-party-licenses.mjs [output-path]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PREFERENCE = ["MIT", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "ISC", "Zlib", "Unicode-3.0", "MPL-2.0", "0BSD", "MIT-0", "Unlicense", "CC0-1.0"];
const FILE_HINTS = {
  MIT: /mit/i,
  "Apache-2.0": /apache/i,
  "BSD-3-Clause": /bsd/i,
  "BSD-2-Clause": /bsd/i,
  Zlib: /zlib/i,
  "Unicode-3.0": /unicode/i,
  Unlicense: /unlicense/i,
  "MIT-0": /mit/i,
  "0BSD": /bsd/i,
  "CC0-1.0": /cc0/i,
};
const LICENSE_FILE = /^(licen[sc]e|copying|unlicense)/i;
const SHARED_TEXT = new Set(["Apache-2.0", "MPL-2.0"]);
const TEMPLATES = {
  MIT: (holder) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  "BSD-3-Clause": (holder) => `BSD 3-Clause License

Copyright (c) ${holder}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
};
const NOTICE_FILE = /^notice/i;

export function chooseLicenses(expression) {
  if (!expression) {
    return [];
  }
  return expression
    .replace(/[()]/g, "")
    .split(/\s+AND\s+/i)
    .map((term) => {
      const options = term.split(/\s+OR\s+|\s*\/\s*/i).map((option) => option.trim()).filter(Boolean);
      return [...options].sort((a, b) => rank(a) - rank(b))[0];
    });
}

function rank(id) {
  const index = PREFERENCE.indexOf(id);
  return index === -1 ? PREFERENCE.length : index;
}

export function pickLicenseFile(files, licenseId, licenseCount) {
  const candidates = files.filter((file) => LICENSE_FILE.test(file));
  const hint = FILE_HINTS[licenseId];
  const hinted = hint && candidates.find((file) => hint.test(file.replace(/^licen[sc]e/i, "")));
  if (hinted) {
    return hinted;
  }
  const generic = candidates.filter((file) => !Object.values(FILE_HINTS).some((pattern) => pattern.test(file.replace(/^licen[sc]e/i, ""))));
  if (generic.length === 1 && (licenseCount === 1 || candidates.length === 1)) {
    return generic[0];
  }
  return candidates.length === 1 && licenseCount === 1 ? candidates[0] : null;
}

function licenseTexts(dir, expression) {
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const chosen = chooseLicenses(expression);
  const found = chosen.map((id) => {
    const file = pickLicenseFile(files, id, chosen.length);
    return { id, text: file ? readFileSync(join(dir, file), "utf8").trim() : null };
  });
  const notices = files.filter((file) => NOTICE_FILE.test(file)).map((file) => readFileSync(join(dir, file), "utf8").trim());
  return { chosen, found, notices };
}

export function fillMissingTexts(entries) {
  const shared = new Map();
  for (const entry of entries) {
    for (const { id, text } of entry.licenses.found) {
      if (text && SHARED_TEXT.has(id) && entry.licenses.chosen.length === 1 && !shared.has(id)) {
        shared.set(id, text);
      }
    }
  }
  return entries.map((entry) => {
    const texts = entry.licenses.found.map(({ id, text }) => {
      if (text) {
        return text;
      }
      if (shared.has(id)) {
        return shared.get(id);
      }
      const template = TEMPLATES[id];
      return template ? template(entry.authors.length ? entry.authors.join(", ") : `the ${entry.name} developers`) : null;
    });
    return { ...entry, texts: { chosen: entry.licenses.chosen, texts: [...texts.filter(Boolean), ...entry.licenses.notices] } };
  });
}

function findPackageDir(fromDir, name) {
  let dir = fromDir;
  while (true) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function npmPackages(root) {
  const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const seen = new Map();
  const visit = (fromDir, name) => {
    const dir = findPackageDir(fromDir, name);
    if (!dir || seen.has(dir)) {
      return;
    }
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const author = typeof manifest.author === "string" ? manifest.author : manifest.author?.name;
    seen.set(dir, {
      name: manifest.name,
      version: manifest.version,
      license: manifest.license ?? null,
      authors: author ? [author] : [],
      dir,
      url: `https://www.npmjs.com/package/${manifest.name}`,
    });
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      visit(dir, dependency);
    }
  };
  for (const dependency of Object.keys(rootManifest.dependencies ?? {})) {
    visit(root, dependency);
  }
  return [...seen.values()];
}

function rustCrates(root) {
  const metadata = JSON.parse(
    execFileSync("cargo", ["metadata", "--format-version", "1", "--manifest-path", join(root, "src-tauri/Cargo.toml"), "--filter-platform", "aarch64-apple-darwin"], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    }),
  );
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const seen = new Set();
  const stack = [metadata.resolve.root];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    for (const dependency of nodes.get(id).deps) {
      if (dependency.dep_kinds.some((kind) => kind.kind === null)) {
        stack.push(dependency.pkg);
      }
    }
  }
  seen.delete(metadata.resolve.root);
  return [...seen].map((id) => {
    const pkg = packages.get(id);
    return {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? null,
      authors: (pkg.authors ?? []).map((author) => author.replace(/\s*<[^>]*>/, "")),
      dir: dirname(pkg.manifest_path),
      url: `https://crates.io/crates/${pkg.name}`,
    };
  });
}

export function renderNotices(groups) {
  const texts = new Map();
  const lines = [];
  const missing = [];
  for (const [title, entries] of groups) {
    lines.push(`${title}`, "-".repeat(title.length));
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))) {
      const { chosen, texts: found } = entry.texts;
      lines.push(`${entry.name} ${entry.version} (${entry.license ?? "unknown license"})`);
      if (!found.length) {
        missing.push(`${entry.name} ${entry.version}: ${chosen.join(" AND ") || "unknown"}, see ${entry.url}`);
      }
      for (const text of found) {
        const key = createHash("sha256").update(text).digest("hex");
        if (!texts.has(key)) {
          texts.set(key, { text, users: [] });
        }
        texts.get(key).users.push(`${entry.name} ${entry.version}`);
      }
    }
    lines.push("");
  }
  const sections = [...texts.values()].map(
    ({ text, users }, index) => `${"=".repeat(72)}\nLicense ${index + 1}, used by: ${users.join(", ")}\n${"=".repeat(72)}\n\n${text}\n`,
  );
  const missingSection = missing.length
    ? ["Packages without a bundled license file (license text available from the linked source):", ...missing.map((item) => `  ${item}`), ""]
    : [];
  return [...lines, ...missingSection, ...sections].join("\n");
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = resolve(root, process.argv[2] ?? "public/third-party-licenses.txt");
  const npm = npmPackages(root).map((entry) => ({ ...entry, group: "npm packages" }));
  const crates = rustCrates(root).map((entry) => ({ ...entry, group: "Rust crates" }));
  const resolved = fillMissingTexts([...npm, ...crates].map((entry) => ({ ...entry, licenses: licenseTexts(entry.dir, entry.license) })));
  const body = renderNotices(
    ["npm packages", "Rust crates"].map((group) => [group, resolved.filter((entry) => entry.group === group)]),
  );
  const header = [
    "Clumsy third-party licenses",
    "",
    "Clumsy is released under the MIT License. It includes the open source",
    "software listed below, used under the licenses that follow the list.",
    "Source for every package is available from npm (npmjs.com) or crates.io.",
    "",
    "",
  ].join("\n");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, header + body);
  console.log(`Wrote ${output}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
