import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { adjustHidden, UNMEASURED_WIDTH } from "../lib/toolbarOverflow";

const OVERFLOW_BUTTON = 32;

const columnGap = (element: Element) => parseFloat(getComputedStyle(element).columnGap) || 0;

export function useToolbarOverflow(order: string[]) {
  const toolbar = useRef<HTMLElement>(null);
  const widths = useRef(new Map<string, number>());
  const orderRef = useRef(order);
  orderRef.current = order;
  const [hidden, setHidden] = useState(0);

  const measure = useCallback(() => {
    const bar = toolbar.current;
    if (!bar) {
      return;
    }
    for (const item of bar.querySelectorAll<HTMLElement>("[data-overflow-key]")) {
      if (item.parentElement && !item.closest(".tool-menu")) {
        widths.current.set(item.dataset.overflowKey!, item.getBoundingClientRect().width + columnGap(item.parentElement));
      }
    }
    const end = bar.querySelector(":scope > .toolbar-group.end");
    const before = end?.previousElementSibling;
    if (!end || !before) {
      setHidden(0);
      return;
    }
    const overflow = bar.scrollWidth - bar.clientWidth;
    const slack = end.getBoundingClientRect().left - before.getBoundingClientRect().right - columnGap(bar) - overflow;
    const list = orderRef.current;
    setHidden((current) => adjustHidden(current, slack, list.map((key) => widths.current.get(key) ?? UNMEASURED_WIDTH), OVERFLOW_BUTTON));
  }, []);

  useLayoutEffect(measure);

  useLayoutEffect(() => {
    const bar = toolbar.current;
    if (!bar) {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    for (const child of bar.children) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  });

  const count = Math.min(hidden, order.length);
  return { toolbar, hidden: new Set(order.slice(0, count)) };
}
