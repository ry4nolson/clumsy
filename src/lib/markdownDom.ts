import DOMPurify from "dompurify";
import { isLocalImage } from "./markdownLinks";
import { lineAtOffset, offsetForLine, type LineBlock } from "./markdownScroll";

const purifier = DOMPurify();

purifier.addHook("afterSanitizeAttributes", (node) => {
  if (node instanceof HTMLImageElement || node instanceof HTMLSourceElement) {
    const srcset = node.getAttribute("srcset");
    if (srcset && !srcset.split(",").every((entry) => /^\s*https:/i.test(entry))) {
      node.removeAttribute("srcset");
    }
  }
  if (node instanceof HTMLImageElement) {
    const src = node.getAttribute("src");
    if (isLocalImage(src)) {
      node.setAttribute("data-local-src", src!);
      node.removeAttribute("src");
    }
    node.setAttribute("loading", "lazy");
  }
  if (node instanceof HTMLAnchorElement) {
    node.removeAttribute("target");
  }
  if (node instanceof SVGElement) {
    node.removeAttribute("href");
    node.removeAttribute("xlink:href");
  }
});

export function sanitizeMarkdownHtml(html: string) {
  return purifier.sanitize(html, {
    FORBID_TAGS: ["style", "link", "meta", "base", "form", "button", "select", "textarea", "iframe", "object", "embed", "dialog", "map", "area"],
    FORBID_ATTR: ["autofocus"],
  });
}

export function measureBlocks(container: HTMLElement, content: HTMLElement): LineBlock[] {
  const origin = container.getBoundingClientRect().top - container.scrollTop;
  const blocks: LineBlock[] = [];
  content.querySelectorAll<HTMLElement>("[data-line]").forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (!rect.height) {
      return;
    }
    blocks.push({
      start: Number(element.dataset.line),
      end: Number(element.dataset.lineEnd),
      top: rect.top - origin,
      bottom: rect.bottom - origin,
    });
  });
  return blocks;
}

export const renderedLineAtTop = (container: HTMLElement, content: HTMLElement) => lineAtOffset(measureBlocks(container, content), container.scrollTop);

export const renderedOffsetOf = (container: HTMLElement, content: HTMLElement, line: number) => offsetForLine(measureBlocks(container, content), line);

export function offsetWithin(container: HTMLElement, element: Element) {
  return element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}
