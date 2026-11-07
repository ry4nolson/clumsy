export const UNMEASURED_WIDTH = 120;
export const UNHIDE_MARGIN = 16;

export function adjustHidden(hidden: number, slack: number, widths: number[], overflowButton: number): number {
  let next = Math.min(hidden, widths.length);
  if (slack < 0) {
    let room = next === 0 ? slack - overflowButton : slack;
    while (room < 0 && next < widths.length) {
      room += widths[next];
      next += 1;
    }
    return next;
  }
  let room = slack;
  while (next > 0) {
    const freed = widths[next - 1] - (next === 1 ? overflowButton : 0);
    if (room < freed + UNHIDE_MARGIN) {
      break;
    }
    room -= freed;
    next -= 1;
  }
  return next;
}
