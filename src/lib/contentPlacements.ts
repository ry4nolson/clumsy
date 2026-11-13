export type Matrix = [number, number, number, number, number, number];

export type Placement = { name: string; matrix: Matrix };

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export const multiply = (first: Matrix, then: Matrix): Matrix => [
  first[0] * then[0] + first[1] * then[2],
  first[0] * then[1] + first[1] * then[3],
  first[2] * then[0] + first[3] * then[2],
  first[2] * then[1] + first[3] * then[3],
  first[4] * then[0] + first[5] * then[2] + then[4],
  first[4] * then[1] + first[5] * then[3] + then[5],
];

export const drawnSize = (matrix: Matrix) => ({ width: Math.hypot(matrix[0], matrix[1]), height: Math.hypot(matrix[2], matrix[3]) });

const WHITESPACE = new Set([0, 9, 10, 12, 13, 32]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const MAX_DEPTH = 64;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

const regular = (byte: number) => !WHITESPACE.has(byte) && !DELIMITERS.has(byte);

function skipString(bytes: Uint8Array, start: number) {
  let depth = 1;
  let at = start;
  while (at < bytes.length && depth) {
    const byte = bytes[at];
    if (byte === 0x5c) {
      at += 1;
    } else if (byte === 0x28) {
      depth += 1;
    } else if (byte === 0x29) {
      depth -= 1;
    }
    at += 1;
  }
  return at;
}

function skipInlineImage(bytes: Uint8Array, start: number) {
  for (let at = start; at + 2 < bytes.length; at += 1) {
    const ends = bytes[at + 1] === 0x45 && bytes[at + 2] === 0x49 && (at + 3 >= bytes.length || !regular(bytes[at + 3]));
    if (WHITESPACE.has(bytes[at]) && ends) {
      return at + 3;
    }
  }
  return bytes.length;
}

const latin1 = new TextDecoder("latin1");

const word = (bytes: Uint8Array, start: number, end: number) => latin1.decode(bytes.subarray(start, end));

const nameOf = (raw: string) => raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

export function placementsIn(content: Uint8Array, base: Matrix = IDENTITY): Placement[] {
  const placements: Placement[] = [];
  const saved: Matrix[] = [];
  let matrix = base;
  let operands: Array<number | string | null> = [];
  let at = 0;
  while (at < content.length) {
    const byte = content[at];
    if (WHITESPACE.has(byte)) {
      at += 1;
    } else if (byte === 0x25) {
      while (at < content.length && content[at] !== 10 && content[at] !== 13) {
        at += 1;
      }
    } else if (byte === 0x28) {
      at = skipString(content, at + 1);
      operands.push(null);
    } else if (byte === 0x3c && content[at + 1] !== 0x3c) {
      const end = content.indexOf(0x3e, at);
      at = end < 0 ? content.length : end + 1;
      operands.push(null);
    } else if (byte === 0x2f) {
      let end = at + 1;
      while (end < content.length && regular(content[end])) {
        end += 1;
      }
      operands.push(nameOf(word(content, at + 1, end)));
      at = end;
    } else if (DELIMITERS.has(byte)) {
      at += byte === content[at + 1] && (byte === 0x3c || byte === 0x3e) ? 2 : 1;
    } else {
      let end = at;
      while (end < content.length && regular(content[end])) {
        end += 1;
      }
      const token = word(content, at, end);
      at = end;
      if (NUMBER.test(token)) {
        operands.push(Number(token));
        continue;
      }
      if (token === "q" && saved.length < MAX_DEPTH) {
        saved.push(matrix);
      } else if (token === "Q") {
        matrix = saved.pop() ?? matrix;
      } else if (token === "cm") {
        const values = operands.slice(-6);
        if (values.length === 6 && values.every((value) => typeof value === "number")) {
          matrix = multiply(values as Matrix, matrix);
        }
      } else if (token === "Do") {
        const name = operands.at(-1);
        if (typeof name === "string") {
          placements.push({ name, matrix });
        }
      } else if (token === "ID") {
        at = skipInlineImage(content, at);
      }
      operands = [];
    }
  }
  return placements;
}
