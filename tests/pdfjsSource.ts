import { readFileSync, readdirSync, statSync } from "node:fs";
import { expect } from "vitest";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

const read = (path: string) => readFileSync(join(root, path), "utf8");

export const pdfjs = {
  version: JSON.parse(read("node_modules/pdfjs-dist/package.json")).version as string,
  display: read("node_modules/pdfjs-dist/build/pdf.mjs"),
  viewer: read("node_modules/pdfjs-dist/web/pdf_viewer.mjs"),
  worker: read("node_modules/pdfjs-dist/build/pdf.worker.mjs"),
  css: read("node_modules/pdfjs-dist/web/pdf_viewer.css"),
  image: (name: string) => read(`node_modules/pdfjs-dist/web/images/${name}`),
};

export const app = {
  packageJson: JSON.parse(read("package.json")) as { dependencies: Record<string, string> },
  read,
  sources(dir = "src"): string[] {
    return readdirSync(join(root, dir)).flatMap((name) => {
      const path = `${dir}/${name}`;
      return statSync(join(root, path)).isDirectory() ? app.sources(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
  },
};

export function classSource(source: string, name: string) {
  const start = source.search(new RegExp(`^class ${name}\\b`, "m"));
  if (start < 0) {
    throw new Error(`pdf.js no longer defines class ${name}`);
  }
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end < 0 ? undefined : end + 2);
}

export function classMembers(source: string, name: string) {
  const members = new Set<string>();
  for (let current: string | undefined = name; current; ) {
    const body = classSource(source, current);
    for (const [, member] of body.matchAll(/^ {2}(?:static )?(?:async )?(?:get |set )?\*?([A-Za-z_$][\w$]*)(?: = |;|\()/gm)) {
      members.add(member);
    }
    for (const [, member] of body.matchAll(/\bthis\.([A-Za-z_$][\w$]*) = /g)) {
      members.add(member);
    }
    current = body.match(/^class \w+ extends (\w+)/)?.[1];
  }
  return members;
}

export function methodSource(source: string, className: string, method: string) {
  const body = classSource(source, className);
  const start = body.search(new RegExp(`^ {2}(?:async )?${method}\\(`, "m"));
  if (start < 0) {
    throw new Error(`pdf.js ${className} no longer has ${method}()`);
  }
  return body.slice(start, body.indexOf("\n  }\n", start) + 4);
}

export function functionSource(source: string, name: string) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  if (start < 0) {
    throw new Error(`pdf.js no longer defines function ${name}`);
  }
  return source.slice(start, source.indexOf("\n}\n", start) + 2);
}

export function managerCalls(source: string, manager: string) {
  const calls = new Set<string>();
  for (const [, member] of source.matchAll(new RegExp(`(?:#|\\b_?)${manager}\\??\\.([A-Za-z_$][\\w$]*)`, "g"))) {
    calls.add(member);
  }
  return calls;
}

export function exportedNames(source: string) {
  const names = new Set<string>();
  for (const [, list] of source.matchAll(/^export \{([^}]*)\};/gm)) {
    for (const entry of list.split(",")) {
      const name = entry.trim().split(/\s+as\s+/).pop();
      if (name) {
        names.add(name);
      }
    }
  }
  return names;
}


export function dispatchedEvents(source: string) {
  return new Set(Array.from(source.matchAll(/(?:\.dispatch|#dispatchLayerRendered)\("([a-z]+)"/g), ([, name]) => name));
}

export function listenedEvents(source: string) {
  return new Set(Array.from(source.matchAll(/\._?on\("([a-z]+)"/g), ([, name]) => name));
}

export function cssVariables(css: string) {
  const used = new Set(Array.from(css.matchAll(/var\((--[\w-]+)/g), ([, name]) => name));
  const defined = new Set(Array.from(css.matchAll(/(--[\w-]+)\s*:/g), ([, name]) => name));
  return { used, defined };
}

export function cursorHotspots(css: string) {
  return Array.from(css.matchAll(/(--[\w-]+)\s*:\s*url\(["']?([^)"']*cursor-[\w-]+\.svg)["']?\)\s+(\d+)\s+(\d+)/g), ([, variable, url, x, y]) => ({
    variable,
    image: url.split("/").pop()!,
    x: Number(x),
    y: Number(y),
  }));
}

export function svgSize(svg: string) {
  const tag = svg.match(/<svg[^>]*>/)?.[0] ?? "";
  return { width: Number(tag.match(/\bwidth="(\d+)/)?.[1]), height: Number(tag.match(/\bheight="(\d+)/)?.[1]) };
}

export function expectIn(source: string | Set<string>, pattern: string | RegExp) {
  const found = typeof source !== "string" ? source.has(String(pattern)) : typeof pattern === "string" ? source.includes(pattern) : pattern.test(source);
  expect(found, `pdf.js no longer has ${pattern}`).toBe(true);
}
