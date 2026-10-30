import { findInText, type TextQuery } from "./textFind";

const blockSelector = "p, li, td, th, h1, h2, h3, h4, h5, h6, pre, blockquote, dt, dd, summary, [data-line]";

type Piece = { node: Text; start: number };

function collectText(root: HTMLElement) {
  const pieces: Piece[] = [];
  let text = "";
  let lastBlock: Element | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const block = node.parentElement?.closest(blockSelector) ?? root;
    if (lastBlock && block !== lastBlock) {
      text += "\n";
    }
    lastBlock = block;
    pieces.push({ node, start: text.length });
    text += node.data;
  }
  return { pieces, text };
}

export function clearHighlights(root: HTMLElement) {
  const parents = new Set<Node>();
  root.querySelectorAll("mark.find-match").forEach((mark) => {
    if (mark.parentNode) {
      parents.add(mark.parentNode);
    }
    mark.replaceWith(...mark.childNodes);
  });
  parents.forEach((parent) => parent.normalize());
}

export function highlightMatches(root: HTMLElement, query: TextQuery): HTMLElement[][] {
  clearHighlights(root);
  const { pieces, text } = collectText(root);
  const matches = findInText(text, query);
  const groups: HTMLElement[][] = matches.map(() => []);
  for (let index = matches.length - 1; index >= 0; index--) {
    const { start, end } = matches[index];
    for (let piece = pieces.length - 1; piece >= 0; piece--) {
      const { node, start: pieceStart } = pieces[piece];
      const from = Math.max(start, pieceStart) - pieceStart;
      const to = Math.min(end, pieceStart + node.data.length) - pieceStart;
      if (to <= from || from >= node.data.length) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, to);
      const mark = document.createElement("mark");
      mark.className = "find-match";
      range.surroundContents(mark);
      groups[index].unshift(mark);
    }
  }
  return groups;
}

export function markCurrent(groups: HTMLElement[][], current: number) {
  groups.forEach((group, index) => group.forEach((mark) => mark.classList.toggle("current", index === current)));
}
