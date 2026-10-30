import { lineOf, nextLine, type TextBox } from "./caretLines";
import { isTypingTarget } from "./commands";

export type CaretBrowsing = { setEnabled: (enabled: boolean) => void; dispose: () => void };

type TextSpan = { node: Text; box: TextBox };

function textSpans(container: HTMLElement): TextSpan[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".textLayer span"), (span) => {
    const node = span.firstChild;
    if (!(node instanceof Text) || !node.data.trim()) {
      return null;
    }
    const rect = span.getBoundingClientRect();
    const page = Number(span.closest<HTMLElement>(".page")?.dataset.pageNumber ?? 0);
    return rect.width && rect.height ? { node, box: { page, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } } : null;
  }).filter((span): span is TextSpan => !!span);
}

function charRect(node: Text, offset: number) {
  const range = document.createRange();
  const at = Math.min(offset, node.length - 1);
  range.setStart(node, Math.max(0, at));
  range.setEnd(node, Math.max(0, at) + 1);
  const rect = range.getBoundingClientRect();
  return { left: offset >= node.length ? rect.right : rect.left, top: rect.top, height: rect.height };
}

function offsetAtX(node: Text, x: number) {
  let low = 0;
  let high = node.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const rect = charRect(node, middle);
    const next = charRect(node, middle + 1);
    if ((rect.left + next.left) / 2 < x) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

export function attachCaretBrowsing(container: HTMLElement): CaretBrowsing {
  let enabled = false;
  const mark = document.createElement("div");
  mark.className = "caret-mark";
  mark.setAttribute("aria-hidden", "true");

  const focusIn = () => {
    const selection = window.getSelection();
    const node = selection?.focusNode;
    return selection && node instanceof Text && container.contains(node) && node.parentElement?.closest(".textLayer") ? { selection, node, offset: selection.focusOffset } : null;
  };

  const paint = () => {
    const focus = enabled ? focusIn() : null;
    if (!focus) {
      mark.remove();
      return;
    }
    const rect = charRect(focus.node, focus.offset);
    const box = container.getBoundingClientRect();
    if (!mark.isConnected) {
      container.append(mark);
    }
    mark.style.transform = `translate(${rect.left - box.left + container.scrollLeft}px, ${rect.top - box.top + container.scrollTop}px)`;
    mark.style.height = `${rect.height}px`;
    mark.classList.remove("blink");
    void mark.offsetWidth;
    mark.classList.add("blink");
  };

  const reveal = () => {
    const focus = focusIn();
    if (!focus) {
      return;
    }
    const rect = charRect(focus.node, focus.offset);
    const box = container.getBoundingClientRect();
    if (rect.top < box.top) {
      container.scrollTop -= box.top - rect.top + 16;
    } else if (rect.top + rect.height > box.top + container.clientHeight) {
      container.scrollTop += rect.top + rect.height - box.top - container.clientHeight + 16;
    }
    if (rect.left < box.left || rect.left > box.left + container.clientWidth) {
      container.scrollLeft += rect.left - box.left - container.clientWidth / 2;
    }
  };

  const place = (node: Text, offset: number, extend: boolean) => {
    const selection = window.getSelection();
    if (extend && selection?.rangeCount) {
      selection.extend(node, offset);
    } else {
      selection?.collapse(node, offset);
    }
  };

  const placeAtTop = () => {
    const box = container.getBoundingClientRect();
    const first = textSpans(container).find((span) => span.box.bottom > box.top);
    if (first) {
      place(first.node, 0, false);
    }
  };

  const moveLine = (direction: 1 | -1, extend: boolean) => {
    const focus = focusIn();
    const spans = textSpans(container);
    const index = spans.findIndex((span) => span.node === focus?.node);
    if (!focus || index < 0) {
      return;
    }
    const x = charRect(focus.node, focus.offset).left;
    const target = nextLine(
      spans.map((span) => span.box),
      spans[index].box,
      x,
      direction,
    );
    if (target) {
      const span = spans[target.index];
      place(span.node, offsetAtX(span.node, target.x), extend);
    }
  };

  const moveToLineEdge = (end: boolean, extend: boolean) => {
    const focus = focusIn();
    const spans = textSpans(container);
    const index = spans.findIndex((span) => span.node === focus?.node);
    if (index < 0) {
      return;
    }
    const line = lineOf(
      spans.map((span) => span.box),
      index,
    );
    const span = spans[end ? line.at(-1)! : line[0]];
    place(span.node, end ? span.node.length : 0, extend);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!enabled || event.metaKey || event.ctrlKey || isTypingTarget(target) || target?.closest(".annotationEditorLayer, .annotationLayer")) {
      return;
    }
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!focusIn()) {
      placeAtTop();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      window.getSelection()?.modify(event.shiftKey ? "extend" : "move", event.key === "ArrowLeft" ? "backward" : "forward", event.altKey ? "word" : "character");
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      moveLine(event.key === "ArrowUp" ? -1 : 1, event.shiftKey);
    } else {
      moveToLineEdge(event.key === "End", event.shiftKey);
    }
    reveal();
    paint();
  };

  document.addEventListener("selectionchange", paint);
  container.addEventListener("keydown", onKeyDown, true);

  return {
    setEnabled(next) {
      enabled = next;
      container.classList.toggle("caret-browsing", next);
      if (next && (!document.activeElement || document.activeElement === document.body)) {
        container.focus({ preventScroll: true });
      }
      if (next && !focusIn()) {
        placeAtTop();
      }
      paint();
    },
    dispose() {
      document.removeEventListener("selectionchange", paint);
      container.removeEventListener("keydown", onKeyDown, true);
      mark.remove();
    },
  };
}
