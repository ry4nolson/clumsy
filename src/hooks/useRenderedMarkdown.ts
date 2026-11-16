import { useEffect, useMemo, useState } from "react";
import { afterPaint } from "../lib/afterPaint";
import { headingTree, renderMarkdown, type Heading } from "../lib/markdown";
import { sanitizeMarkdownHtml } from "../lib/markdownDom";

const DEFERRED_LENGTH = 200_000;

type Rendered = { text: string; html: string; headings: Heading[] };

const NO_HEADINGS: Heading[] = [];

function render(text: string): Rendered {
  const { html, headings } = renderMarkdown(text);
  return { text, html: sanitizeMarkdownHtml(html), headings };
}

export function useRenderedMarkdown(text: string) {
  const deferred = text.length >= DEFERRED_LENGTH;
  const direct = useMemo(() => (deferred ? null : render(text)), [deferred, text]);
  const [late, setLate] = useState<Rendered | null>(null);

  useEffect(() => {
    if (!deferred) {
      setLate(null);
      return;
    }
    return afterPaint(() => setLate(render(text)));
  }, [deferred, text]);

  const rendered = direct ?? late;
  const headings = rendered?.headings ?? NO_HEADINGS;
  const outline = useMemo(() => headingTree(headings), [headings]);
  return { html: rendered ? rendered.html : null, headings, outline };
}
