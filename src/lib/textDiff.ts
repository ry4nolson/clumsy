import { diffArrays } from "diff";

export type Range = [start: number, end: number];
export type Segment = { equal: boolean; left: Range; right: Range };

export type DiffRequest = { left: string[]; right: string[]; leftPages: number[]; rightPages: number[] };

export const WHOLE_TIMEOUT = 4000;
export const PAGE_TIMEOUT = 300;
export const FALLBACK_BUDGET = 8000;

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

export function diffByPage(
  { left, right, leftPages, rightPages }: DiffRequest,
  wholeTimeout = WHOLE_TIMEOUT,
  pageTimeout = PAGE_TIMEOUT,
  budget = FALLBACK_BUDGET,
): Segment[] {
  const whole = diffWords(left, right, wholeTimeout);
  if (whole) {
    return whole;
  }
  const count = Math.max((leftPages.at(-1) ?? -1) + 1, (rightPages.at(-1) ?? -1) + 1);
  const leftRanges = pageRanges(leftPages, count);
  const rightRanges = pageRanges(rightPages, count);
  const segments: Segment[] = [];
  const deadline = Date.now() + budget;
  for (let page = 0; page < count; page++) {
    const [leftStart, leftEnd] = leftRanges[page];
    const [rightStart, rightEnd] = rightRanges[page];
    const remaining = deadline - Date.now();
    const pageSegments = (remaining > 0 && diffWords(left.slice(leftStart, leftEnd), right.slice(rightStart, rightEnd), Math.min(pageTimeout, remaining))) || [
      { equal: false, left: [0, leftEnd - leftStart], right: [0, rightEnd - rightStart] } satisfies Segment,
    ];
    for (const segment of pageSegments) {
      push(
        segments,
        segment.equal,
        [segment.left[0] + leftStart, segment.left[1] + leftStart],
        [segment.right[0] + rightStart, segment.right[1] + rightStart],
      );
    }
  }
  return segments;
}
