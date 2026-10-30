import { describe, expect, it } from "vitest";
import { classifyHref, isLocalImage, localImagePath } from "../src/lib/markdownLinks";

describe("classifyHref", () => {
  it("scrolls to anchors inside the document", () => {
    expect(classifyHref("#install-pnpm")).toEqual({ kind: "anchor", id: "install-pnpm" });
    expect(classifyHref("#caf%C3%A9")).toEqual({ kind: "anchor", id: "café" });
    expect(classifyHref("#")).toEqual({ kind: "ignored" });
  });

  it("sends web and mail links out", () => {
    expect(classifyHref("https://example.com/a")).toEqual({ kind: "external", url: "https://example.com/a" });
    expect(classifyHref("mailto:a@b.c")).toEqual({ kind: "external", url: "mailto:a@b.c" });
  });

  it("opens linked Markdown and PDF files", () => {
    expect(classifyHref("docs/setup.md")).toEqual({ kind: "file", path: "docs/setup.md", anchor: null });
    expect(classifyHref("../Guide%20One.MD#usage")).toEqual({ kind: "file", path: "../Guide One.MD", anchor: "usage" });
    expect(classifyHref("./spec.pdf?x=1")).toEqual({ kind: "file", path: "./spec.pdf", anchor: null });
  });

  it("ignores everything else", () => {
    for (const href of ["", null, "javascript:alert(1)", "file:///etc/passwd.md", "//evil.example/a.md", "src/main.ts", "data:text/html,x"]) {
      expect(classifyHref(href)).toEqual({ kind: "ignored" });
    }
  });
});

describe("local images", () => {
  it("only resolves relative and absolute file paths", () => {
    expect(isLocalImage("img/a.png")).toBe(true);
    expect(isLocalImage("/Users/me/a.png")).toBe(true);
    expect(isLocalImage("https://shields.io/badge.svg")).toBe(false);
    expect(isLocalImage("data:image/png;base64,AA")).toBe(false);
    expect(isLocalImage("//cdn.example/a.png")).toBe(false);
    expect(isLocalImage("")).toBe(false);
    expect(localImagePath("img/my%20shot.png?raw=1")).toBe("img/my shot.png");
  });
});
