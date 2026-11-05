import { diffArrays } from "diff";
import { uniqueRuns } from "./anchors";

export type Range = [start: number, end: number];
export type Segment = { equal: boolean; left: Range; right: Range };

export type DiffRequest = { left: string[]; right: string[]; leftPages: number[]; rightPages: number[] };

export const WHOLE_TIMEOUT = 4000;
export const PAGE_TIMEOUT = 300;
export const FALLBACK_BUDGET = 8000;
export const EXACT_LIMIT = 40000;
export const ANCHOR_LENGTH = 8;

function push(segments: Segment[], equal: boolean, left: Range, right: Range) {
  if (left[0] === left[1] && right[0] === right[1]) {
    return;
  }
  const last = segments.at(-1);
  if (last && last.equal === equal && last.left[1] === left[0] && last.right[1] === right[0]) {
    last.left = [last.left[0], left[1]];
    last.right = [last.right[0], right[1]];
  } else {
    segments.push({ equal, left, right });
  }
}

export function diffWords(left: string[], right: string[], timeout = Infinity): Segment[] | null {
  const changes = diffArrays(left, right, { timeout });
  if (!changes) {
    return null;
  }
  const segments: Segment[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  for (const change of changes) {
    const leftCount = change.added ? 0 : change.count;
    const rightCount = change.removed ? 0 : change.count;
    push(segments, !change.added && !change.removed, [leftIndex, leftIndex + leftCount], [rightIndex, rightIndex + rightCount]);
    leftIndex += leftCount;
    rightIndex += rightCount;
  }
  return segments;
}

export function slideToLineStarts(segments: Segment[], left: string[], right: string[], lineStarts: { left: boolean[]; right: boolean[] }): Segment[] {
  const result = segments.map((segment) => ({ ...segment, left: [...segment.left] as Range, right: [...segment.right] as Range }));
  result.forEach((segment, index) => {
    const side = segment.equal ? null : segment.left[0] === segment.left[1] ? "right" : segment.right[0] === segment.right[1] ? "left" : null;
    if (!side) {
      return;
    }
    const words = side === "left" ? left : right;
    const starts = lineStarts[side];
    const [start, end] = segment[side];
    if (starts[start]) {
      return;
    }
    const previous = result[index - 1];
    const next = result[index + 1];
    if (!previous?.equal || !next?.equal) {
      return;
    }
    let min = 0;
    while (-min < previous[side][1] - previous[side][0] - 1 && words[start + min - 1] === words[end + min - 1]) {
      min--;
    }
    let max = 0;
    while (max < next[side][1] - next[side][0] - 1 && words[start + max] === words[end + max]) {
      max++;
    }
    let shift = 0;
    for (let candidate = min; candidate <= max; candidate++) {
      if (starts[start + candidate] && (!shift || Math.abs(candidate) < Math.abs(shift))) {
        shift = candidate;
      }
    }
    if (!shift) {
      return;
    }
    for (const key of ["left", "right"] as const) {
      segment[key] = [segment[key][0] + shift, segment[key][1] + shift];
      previous[key] = [previous[key][0], previous[key][1] + shift];
      next[key] = [next[key][0] + shift, next[key][1]];
    }
  });
  return result;
}

function pageRanges(pages: number[], count: number) {
  const ranges: Range[] = [];
  let index = 0;
  for (let page = 0; page < count; page++) {
    const start = index;
    while (index < pages.length && pages[index] <= page) {
      index++;
    }
    ranges.push([start, index]);
  }
  return ranges;
}

function pushShifted(segments: Segment[], local: Segment[], leftStart: number, rightStart: number) {
  for (const segment of local) {
    push(segments, segment.equal, [segment.left[0] + leftStart, segment.left[1] + leftStart], [segment.right[0] + rightStart, segment.right[1] + rightStart]);
  }
}

function diffPages(left: string[], right: string[], leftPages: number[], rightPages: number[], deadline: number, pageTimeout: number) {
  const rebase = (pages: number[]) => pages.map((page) => page - pages[0]);
  const leftLocal = rebase(leftPages);
  const rightLocal = rebase(rightPages);
  const count = Math.max((leftLocal.at(-1) ?? -1) + 1, (rightLocal.at(-1) ?? -1) + 1);
  const leftRanges = pageRanges(leftLocal, count);
  const rightRanges = pageRanges(rightLocal, count);
  const segments: Segment[] = [];
  for (let page = 0; page < count; page++) {
    const [leftStart, leftEnd] = leftRanges[page];
    const [rightStart, rightEnd] = rightRanges[page];
    const remaining = deadline - Date.now();
    const pageSegments = (remaining > 0 && diffWords(left.slice(leftStart, leftEnd), right.slice(rightStart, rightEnd), Math.min(pageTimeout, remaining))) || [
      { equal: false, left: [0, leftEnd - leftStart], right: [0, rightEnd - rightStart] } satisfies Segment,
    ];
    pushShifted(segments, pageSegments, leftStart, rightStart);
  }
  return segments;
}

function diffAnchored({ left, right, leftPages, rightPages }: DiffRequest, deadline: number, gapTimeout: number, pageTimeout: number) {
  const segments: Segment[] = [];
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) {
    suffix++;
  }
  push(segments, true, [0, prefix], [0, prefix]);
  let leftAt = prefix;
  let rightAt = prefix;
  const gap = (leftEnd: number, rightEnd: number) => {
    const leftWords = left.slice(leftAt, leftEnd);
    const rightWords = right.slice(rightAt, rightEnd);
    const remaining = deadline - Date.now();
    const exact = leftWords.length + rightWords.length <= EXACT_LIMIT && remaining > 0 && diffWords(leftWords, rightWords, Math.min(gapTimeout, remaining));
    pushShifted(segments, exact || diffPages(leftWords, rightWords, leftPages.slice(leftAt, leftEnd), rightPages.slice(rightAt, rightEnd), deadline, pageTimeout), leftAt, rightAt);
  };
  const leftMiddle = left.slice(prefix, left.length - suffix);
  const rightMiddle = right.slice(prefix, right.length - suffix);
  for (const [leftRun, rightRun] of uniqueRuns(leftMiddle, rightMiddle, ANCHOR_LENGTH)) {
    const leftStart = leftRun + prefix;
    const rightStart = rightRun + prefix;
    if (leftStart < leftAt || rightStart < rightAt) {
      continue;
    }
    gap(leftStart, rightStart);
    let length = 0;
    while (leftStart + length < left.length - suffix && rightStart + length < right.length - suffix && left[leftStart + length] === right[rightStart + length]) {
      length++;
    }
    push(segments, true, [leftStart, leftStart + length], [rightStart, rightStart + length]);
    leftAt = leftStart + length;
    rightAt = rightStart + length;
  }
  gap(left.length - suffix, right.length - suffix);
  push(segments, true, [left.length - suffix, left.length], [right.length - suffix, right.length]);
  return segments;
}

export function diffByPage(request: DiffRequest, wholeTimeout = WHOLE_TIMEOUT, pageTimeout = PAGE_TIMEOUT, budget = FALLBACK_BUDGET): Segment[] {
  const { left, right, leftPages, rightPages } = request;
  if (left.length + right.length > EXACT_LIMIT) {
    return diffAnchored(request, Date.now() + wholeTimeout + budget, wholeTimeout, pageTimeout);
  }
  const whole = diffWords(left, right, wholeTimeout);
  if (whole) {
    return whole;
  }
  return diffPages(left, right, leftPages, rightPages, Date.now() + budget, pageTimeout);
}
