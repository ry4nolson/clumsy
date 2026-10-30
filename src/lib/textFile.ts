export type TextFormat = { bom: boolean; eol: "\n" | "\r\n" };

export type DecodedText = { text: string; format: TextFormat };

const BOM = "﻿";

export function decodeText(bytes: Uint8Array): DecodedText {
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("This file isn't UTF-8 text, so Clumsy can't open it without changing it.");
  }
  const bom = raw.startsWith(BOM);
  const body = bom ? raw.slice(1) : raw;
  const crlf = body.match(/\r\n/g)?.length ?? 0;
  const lf = (body.match(/\n/g)?.length ?? 0) - crlf;
  return { text: body.replace(/\r\n/g, "\n"), format: { bom, eol: crlf > lf ? "\r\n" : "\n" } };
}

export function encodeText(text: string, format: TextFormat) {
  const body = format.eol === "\r\n" ? text.replace(/\r?\n/g, "\r\n") : text;
  return new TextEncoder().encode(format.bom ? BOM + body : body);
}

export const markdownName = /\.(md|markdown)$/i;

export function isMarkdownName(name: string) {
  return markdownName.test(name);
}

export function ensureMarkdownExtension(name: string) {
  return isMarkdownName(name) ? name : `${name.replace(/\.pdf$/i, "")}.md`;
}
