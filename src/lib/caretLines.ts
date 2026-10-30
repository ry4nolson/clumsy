export type TextBox = { page: number; top: number; bottom: number; left: number; right: number };

const middle = (box: TextBox) => (box.top + box.bottom) / 2;
const sameLine = (a: TextBox, b: TextBox) => a.page === b.page && Math.abs(middle(a) - middle(b)) < Math.min(a.bottom - a.top, b.bottom - b.top) / 2;

export function lineOf(boxes: TextBox[], index: number) {
  return boxes.flatMap((box, candidate) => (sameLine(box, boxes[index]) ? [candidate] : [])).sort((a, b) => boxes[a].left - boxes[b].left);
}

function nearestLine(boxes: TextBox[], from: TextBox, direction: 1 | -1, page: number) {
  const height = from.bottom - from.top;
  let best: number | null = null;
  boxes.forEach((box, index) => {
    if (box.page !== page) {
      return;
    }
    const offset = (middle(box) - middle(from)) * direction;
    if (page === from.page && offset < height / 2) {
      return;
    }
    if (best === null || (middle(box) - middle(boxes[best])) * direction < 0) {
      best = index;
    }
  });
  return best;
}

export function nextLine(boxes: TextBox[], from: TextBox, x: number, direction: 1 | -1): { index: number; x: number } | null {
  const pages = [...new Set(boxes.map((box) => box.page))].sort((a, b) => (a - b) * direction);
  const start = pages.findIndex((page) => (page - from.page) * direction >= 0);
  for (const page of start < 0 ? [] : pages.slice(start)) {
    const found = nearestLine(boxes, from, direction, page);
    if (found === null) {
      continue;
    }
    const line = lineOf(boxes, found);
    const distance = (box: TextBox) => (x < box.left ? box.left - x : x > box.right ? x - box.right : 0);
    const index = line.reduce((best, candidate) => (distance(boxes[candidate]) < distance(boxes[best]) ? candidate : best), line[0]);
    const box = boxes[index];
    return { index, x: Math.min(Math.max(x, box.left), box.right) };
  }
  return null;
}
