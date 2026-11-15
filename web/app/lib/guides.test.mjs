import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import bundled from "../../content/guides.json";
import { keyCaps, keysHtml, renderGuide, windowsKeyCaps } from "./guideMarkdown";
import { findGuide, parseGuideIndex, toGuideIndex } from "./guides";

const folder = new URL("../../content/guides/", import.meta.url);
const index = toGuideIndex(bundled);
const slugs = index.groups.flatMap((group) => group.guides.map((guide) => guide.slug));

describe("guide index", () => {
  it("accepts the bundled index", () => {
    expect(index).toEqual(bundled);
  });

  it("has one Markdown file per guide and no strays", () => {
    const files = readdirSync(folder).map((name) => name.replace(/\.md$/, ""));
    expect(files.sort()).toEqual([...slugs].sort());
  });

  it("refuses broken or unsafe entries", () => {
    const withGuide = (guide) => JSON.stringify({ groups: [{ title: "x", guides: [guide] }] });
    expect(parseGuideIndex("{")).toBeNull();
    expect(parseGuideIndex(JSON.stringify({ groups: [] }))).toBeNull();
    expect(parseGuideIndex(withGuide({ slug: "../secrets", title: "x", summary: "y" }))).toBeNull();
    expect(parseGuideIndex(withGuide({ slug: "a", title: "x" }))).toBeNull();
    expect(parseGuideIndex(JSON.stringify({ groups: [{ title: "x", guides: [{ slug: "a", title: "x", summary: "y" }, { slug: "a", title: "x", summary: "y" }] }] }))).toBeNull();
  });

  it("drops unknown fields and unknown screenshots", () => {
    const parsed = parseGuideIndex(JSON.stringify({ groups: [{ title: "x", guides: [{ slug: "a", title: "x", summary: "y", image: "nope", imageAlt: "z", html: "<script>" }] }] }));
    expect(parsed.groups[0].guides[0]).toEqual({ slug: "a", title: "x", summary: "y" });
  });

  it("finds a guide with its neighbors", () => {
    const first = findGuide(index, slugs[0]);
    expect(first.previous).toBeNull();
    expect(first.next.slug).toBe(slugs[1]);
    expect(findGuide(index, slugs.at(-1)).next).toBeNull();
    expect(findGuide(index, "missing")).toBeNull();
  });
});

describe("guide Markdown", () => {
  it("splits shortcuts into key caps", () => {
    expect(keyCaps("⇧⌘P")).toEqual(["⇧", "⌘", "P"]);
    expect(keyCaps("Space")).toEqual(["Space"]);
    expect(keyCaps("⌃⇧-")).toEqual(["⌃", "⇧", "-"]);
    expect(keyCaps("⌘")).toEqual(["⌘"]);
  });

  it("renders shortcuts, section ids, and escapes HTML", () => {
    const { html, sections } = renderGuide("## Find it\n\nPress [[⌘\\]] or [[⇧⌘]]] then <b>go</b>.\n\n## Find it\n");
    expect(html).toContain('<span class="keys only-mac"><kbd>⌘</kbd><kbd>\\</kbd></span>');
    expect(html).toContain("<kbd>⇧</kbd><kbd>⌘</kbd><kbd>]</kbd>");
    expect(html).toContain("<kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>]</kbd>");
    expect(html).toContain("&lt;b&gt;go&lt;/b&gt;");
    expect(sections).toEqual([
      { id: "find-it", title: "Find it" },
      { id: "find-it-2", title: "Find it" },
    ]);
  });

  it("turns Mac shortcuts into Windows ones", () => {
    expect(windowsKeyCaps("⇧⌘P")).toEqual(["Ctrl", "Shift", "P"]);
    expect(windowsKeyCaps("⌥⌘↓")).toEqual(["Ctrl", "Alt", "↓"]);
    expect(windowsKeyCaps("⌘")).toEqual(["Ctrl"]);
    expect(windowsKeyCaps("⌃G")).toBeNull();
    expect(keysHtml("F7")).toBe('<span class="keys"><kbd>F7</kbd></span>');
    expect(keysHtml("⌘S")).toBe('<span class="keys only-mac"><kbd>⌘</kbd><kbd>S</kbd></span><span class="keys only-win"><kbd>Ctrl</kbd><kbd>S</kbd></span>');
    expect(keysHtml("⌃G ~ Go > Go to Page")).toContain('<span class="menu-path only-win">Go &gt; Go to Page</span>');
    expect(keysHtml("⌃G ~ Alt+G")).toContain('<span class="keys only-win"><kbd>Alt</kbd><kbd>G</kbd></span>');
    expect(keysHtml("⌃G")).toBe('<span class="keys only-mac"><kbd>⌃</kbd><kbd>G</kbd></span>');
  });

  it("renders text for one platform inline, as a block, and on rows and list items", () => {
    expect(renderGuide("Save{{mac:  and [[⌘P]] print}}.").html).toContain('Save<span class="only-mac"> and <span class="keys only-mac">');
    const block = renderGuide("## Both\n\n::: win\n## Updates\n\nBy hand.\n:::\n\nAfter.");
    expect(block.html).toContain('<div class="only-win">\n<h2 id="updates">Updates</h2>\n<p>By hand.</p>\n</div>\n<p>After.</p>');
    expect(block.sections).toEqual([{ id: "both", title: "Both" }, { id: "updates", title: "Updates", only: "win" }]);
    const rows = renderGuide("| a | b |\n| --- | --- |\n| {{mac: Finder}} | x |\n\n- {{win: Explorer}}\n- Both");
    expect(rows.html).toContain('<tr class="only-mac">\n<td>Finder</td>');
    expect(rows.html).toContain('<li class="only-win">Explorer</li>');
  });

  it("gives every Mac-only shortcut in the guides a Windows answer", () => {
    for (const slug of slugs) {
      let macOnly = false;
      for (const line of readFileSync(new URL(`${slug}.md`, folder), "utf8").split("\n")) {
        if (line.startsWith(":::")) macOnly = line === "::: mac";
        for (const [, keys] of line.matchAll(/\[\[([^\]]*⌃[^\]]*)\]\]/g)) {
          expect(macOnly || keys.includes(" ~ ") || line.includes("{{mac:"), `${slug}: ${keys}`).toBe(true);
        }
      }
    }
  });

  it("marks outside links and refuses empty text", () => {
    expect(renderGuide("[a](https://example.com) [b](/guides/x)").html).toContain('rel="noopener noreferrer"');
    expect(renderGuide("[b](/guides/x)").html).not.toContain("rel=");
    expect(renderGuide("  \n")).toBeNull();
  });

  it("renders every bundled guide with links that resolve", () => {
    for (const slug of slugs) {
      const rendered = renderGuide(readFileSync(new URL(`${slug}.md`, folder), "utf8"));
      expect(rendered.sections.length, slug).toBeGreaterThan(1);
      expect(rendered.html, slug).not.toMatch(/\[\[|\]\]|\{\{|\}\}|:::/);
      for (const [, target] of rendered.html.matchAll(/href="\/guides\/([^"#]+)/g)) {
        expect(slugs, `${slug} links to ${target}`).toContain(target);
      }
    }
  });
});
