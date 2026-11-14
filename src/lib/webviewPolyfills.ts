type Base64Options = { alphabet?: "base64" | "base64url"; omitPadding?: boolean };

type RegExpStatics = { escape?: unknown };

type PromiseStatics = { try?: unknown };

const SYNTAX_CHARACTERS = new Set("^$\\.*+?()[]{}|/");

const HEX_ESCAPED = new Set(",-=<>#&!%:;@~'`\"");

function define(target: object, name: string, value: unknown) {
  if (typeof (target as Record<string, unknown>)[name] !== "function") {
    Object.defineProperty(target, name, { configurable: true, writable: true, value });
  }
}

function hexEscape(character: string) {
  const code = character.codePointAt(0)!;
  return code <= 0xff ? `\\x${code.toString(16).padStart(2, "0")}` : `\\u${code.toString(16).padStart(4, "0")}`;
}

export function escapeRegExp(text: string) {
  if (typeof text !== "string") {
    throw new TypeError("RegExp.escape requires a string");
  }
  let escaped = "";
  for (const character of text) {
    if (escaped === "" && /[0-9A-Za-z]/.test(character)) {
      escaped += hexEscape(character);
    } else if (SYNTAX_CHARACTERS.has(character)) {
      escaped += `\\${character}`;
    } else if (HEX_ESCAPED.has(character) || /^\s$/u.test(character) || (character.length === 1 && /[\uD800-\uDFFF]/.test(character))) {
      escaped += hexEscape(character);
    } else {
      escaped += character;
    }
  }
  return escaped;
}

export function bytesToHex(bytes: Uint8Array) {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export function bytesToBase64(bytes: Uint8Array, { alphabet = "base64", omitPadding = false }: Base64Options = {}) {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  let encoded = btoa(binary);
  if (alphabet === "base64url") {
    encoded = encoded.replace(/\+/g, "-").replace(/\//g, "_");
  }
  return omitPadding ? encoded.replace(/=+$/, "") : encoded;
}

export function base64ToBytes(text: string, { alphabet = "base64" }: Base64Options = {}) {
  if (typeof text !== "string") {
    throw new TypeError("Uint8Array.fromBase64 requires a string");
  }
  let normalized = text.replace(/[\t\n\f\r ]/g, "");
  if (alphabet === "base64url") {
    normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");
  }
  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw new SyntaxError("Invalid base64 string");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function installBytesEncoding(prototype: object = Uint8Array.prototype, statics: object = Uint8Array) {
  define(prototype, "toHex", function (this: Uint8Array) {
    return bytesToHex(this);
  });
  define(prototype, "toBase64", function (this: Uint8Array, options?: Base64Options) {
    return bytesToBase64(this, options);
  });
  define(statics, "fromBase64", base64ToBytes);
}

export function installRegExpEscape(target: RegExpStatics = RegExp as RegExpStatics) {
  define(target, "escape", escapeRegExp);
}

export function installUrlParse(target: object = URL) {
  define(target, "parse", function (this: typeof URL, url: string | URL, base?: string | URL) {
    try {
      return new this(url, base);
    } catch {
      return null;
    }
  });
}

export function installBodyBytes(prototypes: object[] = [globalThis.Response?.prototype, globalThis.Blob?.prototype].filter(Boolean)) {
  for (const prototype of prototypes) {
    define(prototype, "bytes", async function (this: { arrayBuffer(): Promise<ArrayBuffer> }) {
      return new Uint8Array(await this.arrayBuffer());
    });
  }
}

export function installPromiseTry(target: PromiseStatics = Promise as PromiseStatics) {
  define(target, "try", function (this: PromiseConstructor, callback: (...args: unknown[]) => unknown, ...args: unknown[]) {
    return new this((resolve) => resolve(callback(...args)));
  });
}
