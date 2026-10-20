export type SelectModifiers = { toggle: boolean; range: boolean };

export type PageSelection = { pages: number[]; anchor: number | null };

export const emptySelection: PageSelection = { pages: [], anchor: null };

export function selectPage(selection: PageSelection, page: number, { toggle, range }: SelectModifiers): PageSelection {
  if (range && selection.anchor !== null) {
    const [start, end] = selection.anchor < page ? [selection.anchor, page] : [page, selection.anchor];
    const span = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    const pages = toggle ? [...new Set([...selection.pages, ...span])] : span;
    return { pages: pages.sort((a, b) => a - b), anchor: selection.anchor };
  }
  if (toggle) {
    const pages = selection.pages.includes(page) ? selection.pages.filter((candidate) => candidate !== page) : [...selection.pages, page];
    return { pages: pages.sort((a, b) => a - b), anchor: page };
  }
  return { pages: [page], anchor: page };
}

export function targetPages(selection: PageSelection, currentPage: number) {
  return selection.pages.length ? selection.pages : [currentPage];
}

export function followCurrentPage(selection: PageSelection, currentPage: number): PageSelection {
  return selection.pages.includes(currentPage) ? selection : { pages: [], anchor: currentPage };
}
