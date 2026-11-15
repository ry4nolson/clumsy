import MarkdownIt from "markdown-it";

type Token = ReturnType<ReturnType<typeof createRenderer>["parse"]>[number];

export type GuidePlatform = "mac" | "win";
export type GuideSection = { id: string; title: string; only?: GuidePlatform };
export type RenderedGuide = { html: string; sections: GuideSection[] };

const MODIFIERS = "⌃⌥⇧⌘";
const WINDOWS_MODIFIERS = [
  ["⌘", "Ctrl"],
  ["⌥", "Alt"],
  ["⇧", "Shift"],
] as const;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);

function splitCombo(combo: string) {
  const chars = [...combo.trim()];
  const split = chars.findIndex((char) => !MODIFIERS.includes(char));
  return { modifiers: split < 0 ? chars : chars.slice(0, split), key: split < 0 ? "" : chars.slice(split).join("") };
}

export function keyCaps(combo: string) {
  const { modifiers, key } = splitCombo(combo);
  return [...modifiers, ...(key ? [key] : [])];
}

export function windowsKeyCaps(combo: string) {
  const { modifiers, key } = splitCombo(combo);
  if (modifiers.includes("⌃")) return null;
  const names = WINDOWS_MODIFIERS.filter(([symbol]) => modifiers.includes(symbol)).map(([, name]) => name);
  return [...names, ...(key ? [key] : [])];
}

const capsHtml = (caps: string[], only?: GuidePlatform) =>
  `<span class="keys${only ? ` only-${only}` : ""}">${caps.map((cap) => `<kbd>${escapeHtml(cap)}</kbd>`).join("")}</span>`;

export function keysHtml(content: string) {
  const [combo, alternative] = content.split(" ~ ").map((part) => part.trim());
  const mac = keyCaps(combo);
  if (alternative?.includes(" > ")) {
    return `${capsHtml(mac, "mac")}<span class="menu-path only-win">${escapeHtml(alternative)}</span>`;
  }
  const windows = alternative ? alternative.split("+") : windowsKeyCaps(combo);
  if (!windows) return capsHtml(mac, "mac");
  return windows.join() === mac.join() ? capsHtml(mac) : `${capsHtml(mac, "mac")}${capsHtml(windows, "win")}`;
}

const slugOf = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "section";

const wholePlatform = (children: Token[]) =>
  children.length > 1 &&
  children[0].type === "platform_open" &&
  children.findIndex((child) => child.type === "platform_close") === children.length - 1;

function createRenderer() {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

  md.inline.ruler.before("link", "keys", (state, silent) => {
    if (!state.src.startsWith("[[", state.pos)) return false;
    let end = state.src.indexOf("]]", state.pos + 2);
    if (end < 0) return false;
    if (state.src[end + 2] === "]") end += 1;
    const content = state.src.slice(state.pos + 2, end);
    if (!content.trim() || content.includes("\n")) return false;
    if (!silent) state.push("keys", "", 0).content = content;
    state.pos = end + 2;
    return true;
  });

  md.renderer.rules.keys = (tokens, at) => keysHtml(tokens[at].content);

  md.inline.ruler.before("link", "platform", (state, silent) => {
    const match = /^\{\{(mac|win): /.exec(state.src.slice(state.pos, state.pos + 7));
    if (!match) return false;
    const start = state.pos + match[0].length;
    const end = state.src.indexOf("}}", start);
    if (end < 0 || end > state.posMax) return false;
    if (!silent) {
      state.push("platform_open", "span", 1).attrSet("class", `only-${match[1]}`);
      const max = state.posMax;
      state.pos = start;
      state.posMax = end;
      state.md.inline.tokenize(state);
      state.posMax = max;
      state.push("platform_close", "span", -1);
    }
    state.pos = end + 2;
    return true;
  });

  md.block.ruler.before(
    "fence",
    "platform",
    (state, startLine, endLine, silent) => {
      const lineAt = (line: number) => state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]).trim();
      const match = /^::: (mac|win)$/.exec(lineAt(startLine));
      if (!match) return false;
      let close = startLine + 1;
      while (close < endLine && lineAt(close) !== ":::") close += 1;
      if (close >= endLine) return false;
      if (silent) return true;
      const open = state.push("platform_block_open", "div", 1);
      open.attrSet("class", `only-${match[1]}`);
      open.block = true;
      open.map = [startLine, close + 1];
      const lineMax = state.lineMax;
      state.lineMax = close;
      state.md.block.tokenize(state, startLine + 1, close);
      state.lineMax = lineMax;
      state.push("platform_block_close", "div", -1).block = true;
      state.line = close + 1;
      return true;
    },
    { alt: ["paragraph", "list", "blockquote"] },
  );

  md.core.ruler.push("platform_rows", (state) => {
    state.tokens.forEach((token, at) => {
      if (token.type !== "inline" || !token.children || !wholePlatform(token.children)) return;
      const before = state.tokens[at - 1];
      const outer = state.tokens[at - 2];
      const target =
        before?.type === "td_open" && outer?.type === "tr_open"
          ? outer
          : before?.type === "paragraph_open" && outer?.type === "list_item_open"
            ? outer
            : null;
      if (!target) return;
      target.attrJoin("class", String(token.children[0].attrGet("class")));
      token.children = token.children.slice(1, -1);
    });
  });

  md.core.ruler.push("sections", (state) => {
    const sections: GuideSection[] = [];
    const used = new Set<string>();
    let only: GuidePlatform | undefined;
    state.tokens.forEach((token, at) => {
      if (token.type === "platform_block_open") only = token.attrGet("class") === "only-win" ? "win" : "mac";
      if (token.type === "platform_block_close") only = undefined;
      if (token.type !== "heading_open" || token.tag !== "h2") return;
      const title = (state.tokens[at + 1].children ?? [])
        .filter((child) => child.type === "text" || child.type === "code_inline")
        .map((child) => child.content)
        .join("");
      const base = slugOf(title);
      let id = base;
      for (let count = 2; used.has(id); count += 1) id = `${base}-${count}`;
      used.add(id);
      token.attrSet("id", id);
      sections.push(only ? { id, title, only } : { id, title });
    });
    state.env.sections = sections;
  });

  const linkOpen = md.renderer.rules.link_open ?? ((tokens, at, options, _env, self) => self.renderToken(tokens, at, options));
  md.renderer.rules.link_open = (tokens, at, options, env, self) => {
    if (/^https?:/i.test(String(tokens[at].attrGet("href") ?? ""))) tokens[at].attrSet("rel", "noopener noreferrer");
    return linkOpen(tokens, at, options, env, self);
  };

  return md;
}

let renderer: ReturnType<typeof createRenderer> | null = null;

export function renderGuide(text: string): RenderedGuide | null {
  if (!text.trim()) return null;
  renderer ??= createRenderer();
  const env: { sections?: GuideSection[] } = {};
  const html = renderer.render(text, env);
  return { html, sections: env.sections ?? [] };
}
