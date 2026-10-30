import { describe, expect, it } from "vitest";
import { headingAt, headingTree, renderMarkdown, slugify } from "../src/lib/markdown";

const lines = (html: string) => [...html.matchAll(/<(\w+)[^>]*data-line="(\d+)" data-line-end="(\d+)"/g)].map(([, tag, start, end]) => `${tag}:${start}-${end}`);

describe("renderMarkdown", () => {
  it("tags blocks with the source lines they came from", () => {
    const { html } = renderMarkdown("# Title\n\nSome text\nmore text\n\n- one\n- two\n  - nested\n");
    expect(lines(html)).toEqual(["h1:0-1", "p:2-4", "ul:5-8", "li:5-6", "li:6-8", "ul:7-8", "li:7-8"]);
  });

  it("tags table rows and code blocks", () => {
    const { html } = renderMarkdown("| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n\n```js\nconst x = 1;\nconst y = 2;\n```\n");
    expect(lines(html)).toEqual(["table:0-4", "thead:0-1", "tr:0-1", "tbody:2-4", "tr:2-3", "tr:3-4", "pre:5-9"]);
    expect(html).toContain('<code class="hljs language-js">');
    expect(html).toContain("hljs-keyword");
  });

  it("escapes code in unknown languages", () => {
    const { html } = renderMarkdown("```nope\n<b>hi</b>\n```\n");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
  });

  it("shows front matter as a block and keeps the line numbers after it", () => {
    const { html } = renderMarkdown("---\ntitle: Notes\ntags: [a]\n---\n\n# Heading\n");
    expect(html).toContain('class="code-block front-matter"');
    expect(lines(html)).toEqual(["pre:0-4", "h1:5-6"]);
    expect(html).not.toContain("<hr");
  });

  it("only treats a leading rule as front matter when it closes", () => {
    const { html } = renderMarkdown("---\n\nNot front matter\n");
    expect(html).toContain("<hr");
  });

  it("collects headings with unique ids", () => {
    const { html, headings } = renderMarkdown("# Setup\n\n## Install `pnpm`\n\n## Setup\n\n### Setup\n");
    expect(headings).toEqual([
      { title: "Setup", level: 1, line: 0, id: "setup" },
      { title: "Install pnpm", level: 2, line: 2, id: "install-pnpm" },
      { title: "Setup", level: 2, line: 4, id: "setup-1" },
      { title: "Setup", level: 3, line: 6, id: "setup-2" },
    ]);
    expect(html).toContain('<h2 data-line="4" data-line-end="5" id="setup-1">');
  });

  it("renders task lists, footnotes, and linked URLs", () => {
    const { html } = renderMarkdown("- [x] done\n- [ ] todo\n\nSee https://example.com[^1]\n\n[^1]: A note\n");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="#fn1"');
  });
});

describe("slugify", () => {
  it("follows GitHub's heading ids", () => {
    expect(slugify("What's New in 0.5?")).toBe("whats-new-in-05");
    expect(slugify("Café & Crème")).toBe("café--crème");
    expect(slugify("snake_case stays")).toBe("snake_case-stays");
  });
});

describe("headingTree", () => {
  it("nests headings under the nearest shallower one", () => {
    const headings = renderMarkdown("# A\n## B\n### C\n## D\n# E\n### F\n").headings;
    const titles = (nodes: ReturnType<typeof headingTree>): unknown[] => nodes.map((node) => [node.title, titles(node.items)]);
    expect(titles(headingTree(headings))).toEqual([
      ["A", [["B", [["C", []]]], ["D", []]]],
      ["E", [["F", []]]],
    ]);
  });

  it("finds the heading a line belongs to", () => {
    const headings = renderMarkdown("intro\n\n# A\n\ntext\n\n## B\n").headings;
    expect(headingAt(headings, 0)).toBeNull();
    expect(headingAt(headings, 4.5)?.title).toBe("A");
    expect(headingAt(headings, 6)?.title).toBe("B");
  });
});
