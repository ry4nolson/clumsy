import { diffArrays } from "diff";
import { otherSide, type Side } from "./comparison";
import type { LineChange } from "./markdownMap";

export type LineRange = [start: number, end: number];

export type LineChunk = Record<Side, LineRange>;

export type ChunkKind = "added" | "removed" | "modified";

export type LineTotals = { added: number; removed: number };

const size = ([start, end]: LineRange) => end - start;

const LINE_DIFF_TIMEOUT = 500;

export function lineChunks(left: readonly string[], right: readonly string[], timeout = LINE_DIFF_TIMEOUT): LineChunk[] {
  let head = 0;
  while (head < left.length && head < right.length && left[head] === right[head]) {
    head++;
  }
  let tail = 0;
  while (tail < left.length - head && tail < right.length - head && left[left.length - 1 - tail] === right[right.length - 1 - tail]) {
    tail++;
  }
  const leftEnd = left.length - tail;
  const rightEnd = right.length - tail;
  if (head === leftEnd && head === rightEnd) {
    return [];
  }
  const parts = diffArrays(left.slice(head, leftEnd), right.slice(head, rightEnd), { timeout });
  if (!parts) {
    return [{ left: [head, leftEnd], right: [head, rightEnd] }];
  }
  const chunks: LineChunk[] = [];
  let at = { left: head, right: head };
  let open: LineChunk | null = null;
  for (const part of parts) {
    const count = part.value.length;
    if (!part.added && !part.removed) {
      open = null;
      at = { left: at.left + count, right: at.right + count };
      continue;
    }
    if (!open) {
      open = { left: [at.left, at.left], right: [at.right, at.right] };
      chunks.push(open);
    }
    if (part.removed) {
      at.left += count;
      open.left[1] = at.left;
    } else {
      at.right += count;
      open.right[1] = at.right;
    }
  }
  return chunks;
}

export const chunkKind = (chunk: LineChunk): ChunkKind => (!size(chunk.left) ? "added" : !size(chunk.right) ? "removed" : "modified");

export const sideChanges = (chunks: readonly LineChunk[], side: Side, current: number): LineChange[] =>
  chunks.map((chunk, index) => ({ start: chunk[side][0], end: chunk[side][1], kind: chunkKind(chunk), current: index === current }));

export function mapLine(chunks: readonly LineChunk[], from: Side, line: number) {
  const to = otherSide(from);
  let shift = 0;
  for (const chunk of chunks) {
    const [start, end] = chunk[from];
    if (line < start) {
      break;
    }
    if (line < end) {
      return chunk[to][0] + ((line - start) / (end - start)) * size(chunk[to]);
    }
    shift = chunk[to][1] - end;
  }
  return line + shift;
}

export const lineTotals = (chunks: readonly LineChunk[]): LineTotals =>
  chunks.reduce((totals, chunk) => ({ added: totals.added + size(chunk.right), removed: totals.removed + size(chunk.left) }), { added: 0, removed: 0 });

const lines = (count: number) => `${count} ${count === 1 ? "line" : "lines"}`;

export function describeLines({ added, removed }: LineTotals) {
  const parts = [...(added ? [`${lines(added)} added`] : []), ...(removed ? [`${lines(removed)} removed`] : [])];
  return parts.join(", ");
}

export function steppedIndex(current: number, count: number, direction: 1 | -1, resume = 0) {
  if (!count) {
    return -1;
  }
  const from = current < 0 ? (direction > 0 ? resume - 1 : resume) : current;
  return (((from + direction) % count) + count) % count;
}

const touches = (a: LineRange, b: LineRange) => a[0] === b[0] || (a[0] < b[1] && b[0] < a[1]);

export function placeAfterEdit(chunks: readonly LineChunk[], anchor: LineRange) {
  const exact = chunks.findIndex((chunk) => chunk.right[0] === anchor[0]);
  return { current: exact >= 0 ? exact : chunks.findIndex((chunk) => touches(chunk.right, anchor)), resume: chunks.filter((chunk) => chunk.right[0] < anchor[0]).length };
}
