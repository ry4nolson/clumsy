import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, bytesToHex, escapeRegExp, installBodyBytes, installBytesEncoding, installPromiseTry, installRegExpEscape, installUrlParse } from "../src/lib/webviewPolyfills";

describe("bytesToHex", () => {
  it("writes two lowercase digits per byte", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 171, 255]))).toBe("000f10abff");
    expect(bytesToHex(new Uint8Array())).toBe("");
  });
});

describe("bytesToBase64 and base64ToBytes", () => {
  const bytes = new Uint8Array([251, 255, 0, 1, 2, 62, 63]);

  it("round-trips with padding", () => {
    expect(bytesToBase64(bytes)).toBe("+/8AAQI+Pw==");
    expect(base64ToBytes("+/8AAQI+Pw==")).toEqual(bytes);
  });

  it("supports the url alphabet and omitted padding", () => {
    expect(bytesToBase64(bytes, { alphabet: "base64url", omitPadding: true })).toBe("-_8AAQI-Pw");
    expect(base64ToBytes("-_8AAQI-Pw", { alphabet: "base64url" })).toEqual(bytes);
  });

  it("ignores ASCII whitespace and rejects garbage", () => {
    expect(base64ToBytes(" +/8A\nAQI+\tPw== ")).toEqual(bytes);
    expect(() => base64ToBytes("not base64!")).toThrow(SyntaxError);
  });

  it("handles inputs larger than one chunk", () => {
    const large = Uint8Array.from({ length: 100_000 }, (_, index) => index % 256);
    expect(base64ToBytes(bytesToBase64(large))).toEqual(large);
  });
});

describe("escapeRegExp", () => {
  it("makes every string match itself literally, including with the u flag", () => {
    for (const text of ["a.b*c", "(1+2)=3?", "[x]{2}|^$\\/", "price: $5, -10%", "naïve 😀 text", " line\nbreak"]) {
      const pattern = new RegExp(`^${escapeRegExp(text)}$`, "u");
      expect(pattern.test(text)).toBe(true);
    }
  });

  it("hex-escapes a leading letter or digit like the spec", () => {
    expect(escapeRegExp("abc")).toBe("\\x61bc");
    expect(escapeRegExp("1.5")).toBe("\\x31\\.5");
  });
});

describe("installers", () => {
  it("only fill in missing methods", () => {
    const prototype: Record<string, unknown> = {};
    const statics: Record<string, unknown> = {};
    installBytesEncoding(prototype, statics);
    expect(typeof prototype.toHex).toBe("function");
    expect((prototype.toHex as (this: Uint8Array) => string).call(new Uint8Array([1, 2]))).toBe("0102");
    expect((statics.fromBase64 as (text: string) => Uint8Array)("AQI=")).toEqual(new Uint8Array([1, 2]));

    const existing = () => "native";
    const regExp: Record<string, unknown> = { escape: existing };
    installRegExpEscape(regExp);
    expect(regExp.escape).toBe(existing);
  });

  it("Promise.try runs the callback synchronously and captures throws", async () => {
    const target = { try: undefined } as unknown as PromiseConstructor & { try: <T>(callback: (...args: unknown[]) => T, ...args: unknown[]) => Promise<T> };
    Object.setPrototypeOf(target, Promise);
    installPromiseTry(target as unknown as { try?: unknown });
    let ran = false;
    const result = target.try.call(Promise, (value: unknown) => {
      ran = true;
      return value;
    }, 7);
    expect(ran).toBe(true);
    await expect(result).resolves.toBe(7);
    await expect(target.try.call(Promise, () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
  });
});

describe("installUrlParse", () => {
  it("returns a URL or null instead of throwing", () => {
    const target = Object.assign(function (this: object, url: string, base?: string) {
      return new URL(url, base);
    }, {}) as unknown as Record<string, unknown>;
    installUrlParse(target);
    const parse = target.parse as (url: string, base?: string) => URL | null;
    expect(parse.call(URL, "page.pdf", "https://example.com/docs/")?.href).toBe("https://example.com/docs/page.pdf");
    expect(parse.call(URL, "not a url")).toBeNull();
  });
});

describe("installBodyBytes", () => {
  it("reads the body as a Uint8Array", async () => {
    const prototype: Record<string, unknown> = {};
    installBodyBytes([prototype]);
    const body = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    await expect((prototype.bytes as (this: typeof body) => Promise<Uint8Array>).call(body)).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });
});
