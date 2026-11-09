export type Protection = { password: string; ownerPassword?: boolean };

export const serializeProtection = (protection: Protection) => JSON.stringify(protection);

export function parseProtection(text: string): Protection | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null && "password" in value && typeof value.password === "string") {
      return "ownerPassword" in value && value.ownerPassword === true ? { password: value.password, ownerPassword: true } : { password: value.password };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const latin1 = new TextDecoder("latin1");

const TAIL = 2048;
const HEAD = 4096;
const ENTRY = 20;
const MAX_SUBSECTIONS = 10_000;

const text = (bytes: Uint8Array, from: number, to: number) => latin1.decode(bytes.subarray(Math.max(0, from), Math.min(bytes.length, to)));

function lastXrefOffset(bytes: Uint8Array) {
  const tailStart = Math.max(0, bytes.length - TAIL);
  const tail = text(bytes, tailStart, bytes.length);
  const at = tail.lastIndexOf("startxref");
  const offset = at < 0 ? NaN : Number(/^startxref\s+(\d+)/.exec(tail.slice(at))?.[1]);
  return Number.isInteger(offset) && offset > 0 && offset < tailStart + at ? offset : null;
}

function tableTrailer(bytes: Uint8Array, offset: number) {
  let position = offset + (/^\s*xref/.exec(text(bytes, offset, offset + 64))?.[0].length ?? 0);
  for (let count = 0; count < MAX_SUBSECTIONS && position < bytes.length; count += 1) {
    const ahead = text(bytes, position, position + HEAD);
    if (/^\s*trailer\b/.test(ahead)) {
      const end = ahead.search(/\bstartxref\b|\bxref\b/);
      return end < 0 ? ahead : ahead.slice(0, end);
    }
    const header = /^\s*(\d+)\s+(\d+)[ \t]*\r?\n?/.exec(ahead);
    if (!header) {
      return null;
    }
    position += header[0].length + Number(header[2]) * ENTRY;
  }
  return null;
}

function lastTrailer(bytes: Uint8Array) {
  const offset = lastXrefOffset(bytes);
  if (offset === null) {
    return null;
  }
  const head = text(bytes, offset, offset + HEAD);
  if (/^\s*xref\b/.test(head)) {
    return tableTrailer(bytes, offset);
  }
  if (/^\s*\d+\s+\d+\s+obj\b/.test(head)) {
    const stream = head.search(/\bstream\b/);
    return stream < 0 ? head : head.slice(0, stream);
  }
  return null;
}

export function hasEncryptEntry(bytes: Uint8Array): boolean | null {
  const trailer = lastTrailer(bytes);
  return trailer === null ? null : /\/Encrypt\b/.test(trailer);
}

export async function bytesForDisk(
  bytes: Uint8Array,
  protection: Protection | undefined,
  encrypt: (bytes: Uint8Array, password: string) => Promise<Uint8Array>,
) {
  if (!protection || hasEncryptEntry(bytes) === true) {
    return bytes;
  }
  return encrypt(bytes, protection.password);
}
