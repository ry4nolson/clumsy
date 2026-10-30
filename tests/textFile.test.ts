import { describe, expect, it } from "vitest";
import { decodeText, encodeText, ensureMarkdownExtension, isMarkdownName } from "../src/lib/textFile";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("decodeText and encodeText", () => {
  it("round-trips LF, CRLF, and a byte order mark byte for byte", () => {
    for (const original of ["# a\nb\n", "# a\r\nb\r\n", "﻿# a\nb", "﻿# a\r\nb\r\n", ""]) {
      const { text, format } = decodeText(bytes(original));
      expect(text).not.toContain("\r");
      expect(text.startsWith("﻿")).toBe(false);
      expect(encodeText(text, format)).toEqual(bytes(original));
    }
  });

  it("writes edits with the file's own line endings", () => {
    const { text, format } = decodeText(bytes("one\r\ntwo\r\n"));
    expect(new TextDecoder().decode(encodeText(`${text}three\n`, format))).toBe("one\r\ntwo\r\nthree\r\n");
  });

  it("refuses text that isn't UTF-8", () => {
    expect(() => decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toThrow(/UTF-8/);
  });
});

describe("Markdown names", () => {
  it("recognizes Markdown files and names a saved copy", () => {
    expect(isMarkdownName("README.MD")).toBe(true);
    expect(isMarkdownName("notes.markdown")).toBe(true);
    expect(isMarkdownName("a.pdf")).toBe(false);
    expect(ensureMarkdownExtension("notes")).toBe("notes.md");
    expect(ensureMarkdownExtension("notes.md")).toBe("notes.md");
  });
});
