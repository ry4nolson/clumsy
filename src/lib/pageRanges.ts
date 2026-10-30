export function parsePageRange(text: string, pageCount: number): number[] | null {
  const parts = text
    .split(/[,;]/)
    .map((part) => part.replace(/\s+/g, ""))
    .filter(Boolean);
  if (!parts.length) {
    return null;
  }
  const pages = new Set<number>();
  for (const part of parts) {
    const match = /^(\d*)[-–—](\d*)$/.exec(part) ?? /^(\d+)()$/.exec(part);
    if (!match || (!match[1] && !match[2])) {
      return null;
    }
    const isSpan = match[0].length > match[1].length;
    const first = match[1] ? Number(match[1]) : 1;
    const last = isSpan ? (match[2] ? Number(match[2]) : pageCount) : first;
    const [start, end] = first <= last ? [first, last] : [last, first];
    if (start < 1 || end > pageCount) {
      return null;
    }
    for (let page = start; page <= end; page += 1) {
      pages.add(page - 1);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export function formatPageRange(pages: number[]) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const spans: string[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const start = sorted[index];
    while (sorted[index + 1] === sorted[index] + 1) {
      index += 1;
    }
    const end = sorted[index];
    spans.push(start === end ? String(start + 1) : `${start + 1}-${end + 1}`);
  }
  return spans.join(", ");
}
