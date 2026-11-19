export type LineBlock = { start: number; end: number; top: number; bottom: number };

const span = (block: LineBlock) => block.end - block.start;

function innermost(blocks: LineBlock[], contains: (block: LineBlock) => boolean) {
  let best: LineBlock | null = null;
  for (const block of blocks) {
    if (contains(block) && (!best || span(block) < span(best) || (span(block) === span(best) && block.bottom - block.top < best.bottom - best.top))) {
      best = block;
    }
  }
  return best;
}

const interpolate = (value: number, from: number, to: number, fromOut: number, toOut: number) =>
  to <= from ? fromOut : fromOut + ((value - from) / (to - from)) * (toOut - fromOut);

export function lineAtOffset(blocks: LineBlock[], offset: number) {
  const inside = innermost(blocks, (block) => block.top <= offset && offset < block.bottom && block.end > block.start);
  if (inside) {
    return interpolate(offset, inside.top, inside.bottom, inside.start, inside.end);
  }
  const before = blocks.filter((block) => block.bottom <= offset).reduce<LineBlock | null>((best, block) => (!best || block.bottom >= best.bottom ? block : best), null);
  const after = blocks.filter((block) => block.top > offset).reduce<LineBlock | null>((best, block) => (!best || block.top < best.top ? block : best), null);
  if (!after) {
    return before ? before.end : 0;
  }
  const from = before ? { offset: before.bottom, line: before.end } : { offset: 0, line: 0 };
  return interpolate(offset, from.offset, after.top, from.line, after.start);
}

export function offsetForLine(blocks: LineBlock[], line: number) {
  const inside = innermost(blocks, (block) => block.start <= line && line < block.end);
  if (inside) {
    return interpolate(line, inside.start, inside.end, inside.top, inside.bottom);
  }
  const before = blocks.filter((block) => block.end <= line).reduce<LineBlock | null>((best, block) => (!best || block.end > best.end || (block.end === best.end && block.bottom > best.bottom) ? block : best), null);
  const after = blocks.filter((block) => block.start > line).reduce<LineBlock | null>((best, block) => (!best || block.start < best.start || (block.start === best.start && block.top < best.top) ? block : best), null);
  if (!after) {
    return before ? before.bottom : 0;
  }
  const from = before ? { line: before.end, offset: before.bottom } : { line: 0, offset: 0 };
  return interpolate(line, from.line, after.start, from.offset, after.top);
}

type Entry = { block: LineBlock; index: number };

const height = (block: LineBlock) => block.bottom - block.top;

const isInner = (a: Entry, b: Entry) =>
  span(a.block) < span(b.block) || (span(a.block) === span(b.block) && (height(a.block) < height(b.block) || (height(a.block) === height(b.block) && a.index < b.index)));

export function offsetsForLines(blocks: LineBlock[], lines: readonly number[]) {
  const byStart = blocks.map((block, index) => ({ block, index })).sort((a, b) => a.block.start - b.block.start || a.index - b.index);
  const byEnd = [...byStart].sort((a, b) => a.block.end - b.block.end || a.index - b.index);
  const offsets = new Map<number, number>();
  let active: Entry[] = [];
  let opened = 0;
  let closed = 0;
  let before: LineBlock | null = null;
  for (const line of [...new Set(lines)].sort((a, b) => a - b)) {
    while (opened < byStart.length && byStart[opened].block.start <= line) {
      active.push(byStart[opened++]);
    }
    active = active.filter(({ block }) => line < block.end);
    while (closed < byEnd.length && byEnd[closed].block.end <= line) {
      const { block } = byEnd[closed++];
      if (!before || block.end > before.end || (block.end === before.end && block.bottom > before.bottom)) {
        before = block;
      }
    }
    const inside = active.reduce<Entry | null>((best, entry) => (!best || isInner(entry, best) ? entry : best), null)?.block;
    if (inside) {
      offsets.set(line, interpolate(line, inside.start, inside.end, inside.top, inside.bottom));
      continue;
    }
    let after: LineBlock | null = byStart[opened]?.block ?? null;
    for (let next = opened + 1; after && next < byStart.length && byStart[next].block.start === after.start; next++) {
      if (byStart[next].block.top < after.top) {
        after = byStart[next].block;
      }
    }
    const from = before ? { line: before.end, offset: before.bottom } : { line: 0, offset: 0 };
    offsets.set(line, after ? interpolate(line, from.line, after.start, from.offset, after.top) : before ? before.bottom : 0);
  }
  return offsets;
}
