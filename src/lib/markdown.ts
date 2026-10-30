import MarkdownIt, { type StateBlock, type StateCore, type Token } from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js/lib/common";

export type Heading = { title: string; level: number; line: number; id: string };

export type HeadingNode = Heading & { items: HeadingNode[] };

export type RenderedMarkdown = { html: string; headings: Heading[] };

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function highlight(code: string, language: string) {
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(code);
    }
  }
  return escapeHtml(code);
}

function frontMatter(state: StateBlock, startLine: number, endLine: number, silent: boolean) {
  const text = (line: number) => state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
  if (startLine !== 0 || state.level !== 0 || text(0) !== "---") {
    return false;
  }
  let close = 1;
  while (close < endLine && text(close) !== "---" && text(close) !== "...") {
    close++;
  }
  if (close >= endLine) {
    return false;
  }
  if (!silent) {
    const token = state.push("front_matter", "pre", 0);
    token.block = true;
    token.map = [0, close + 1];
    token.content = state.getLines(1, close, 0, true);
  }
  state.line = close + 1;
  return true;
}

function plainText(inline: Token | undefined) {
  return (inline?.children ?? [])
    .map((child) => (child.type === "text" || child.type === "code_inline" || child.type === "image" ? child.content : ""))
    .join("")
    .trim();
}

export function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

function sourceLines(state: StateCore) {
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  state.tokens.forEach((token, index) => {
    if (!token.map || token.nesting === -1 || token.type === "inline") {
      return;
    }
    token.attrSet("data-line", String(token.map[0]));
    token.attrSet("data-line-end", String(token.map[1]));
    if (token.type === "heading_open") {
      const title = plainText(state.tokens[index + 1]);
      const base = slugify(title) || "section";
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      const id = count ? `${base}-${count}` : base;
      token.attrSet("id", id);
      headings.push({ title: title || "Untitled", level: Number(token.tag.slice(1)), line: token.map[0], id });
    }
  });
  state.env.headings = headings;
}

const markdown = new MarkdownIt({ html: true, linkify: true }).use(footnote).use(taskLists);

markdown.block.ruler.before("hr", "front_matter", frontMatter, { alt: [] });
markdown.core.ruler.push("source_lines", sourceLines);

const codeBlock = (token: Token, language: string, attrs: string) =>
  `<pre${attrs}><code class="hljs${language ? ` language-${escapeHtml(language)}` : ""}">${highlight(token.content, language)}</code></pre>\n`;

markdown.renderer.rules.fence = (tokens, index, _options, _env, self) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0] ?? "";
  token.attrJoin("class", "code-block");
  return codeBlock(token, language, self.renderAttrs(token));
};

markdown.renderer.rules.code_block = (tokens, index, _options, _env, self) => {
  const token = tokens[index];
  token.attrJoin("class", "code-block");
  return codeBlock(token, "", self.renderAttrs(token));
};

markdown.renderer.rules.front_matter = (tokens, index, _options, _env, self) => {
  const token = tokens[index];
  token.attrJoin("class", "code-block front-matter");
  return codeBlock(token, "yaml", self.renderAttrs(token));
};

export function renderMarkdown(text: string): RenderedMarkdown {
  const env: { headings?: Heading[] } = {};
  const html = markdown.render(text, env);
  return { html, headings: env.headings ?? [] };
}

export function headingTree(headings: Heading[]): HeadingNode[] {
  const roots: HeadingNode[] = [];
  const stack: HeadingNode[] = [];
  for (const heading of headings) {
    const node: HeadingNode = { ...heading, items: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    (stack.length ? stack[stack.length - 1].items : roots).push(node);
    stack.push(node);
  }
  return roots;
}

export function headingAt(headings: Heading[], line: number) {
  let current: Heading | null = null;
  for (const heading of headings) {
    if (heading.line > line) {
      break;
    }
    current = heading;
  }
  return current;
}
