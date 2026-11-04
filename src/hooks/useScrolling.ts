import { useEffect, useState, type RefObject } from "react";

const SETTLE_MS = 150;

export function useScrolling(containerRef: RefObject<HTMLElement | null>) {
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    let timer = 0;
    const onScroll = () => {
      setScrolling(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setScrolling(false), SETTLE_MS);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [containerRef]);

  return scrolling;
}
