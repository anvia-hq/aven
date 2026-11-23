import { useCallback, useEffect, useState, type RefObject } from "react";

const EDGE = 4;
const PAGE_FRACTION = 0.8;

export function useRailScroll(ref: RefObject<HTMLElement | null>) {
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const element = ref.current;

    if (!element) return;

    const max = element.scrollWidth - element.clientWidth;

    setEdges({ start: element.scrollLeft <= EDGE, end: element.scrollLeft >= max - EDGE });
  }, [ref]);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    measure();

    const observer = new ResizeObserver(measure);

    observer.observe(element);

    return () => observer.disconnect();
  }, [measure, ref]);

  const page = useCallback(
    (direction: -1 | 1) => {
      const element = ref.current;

      if (!element) return;

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      element.scrollBy({
        left: direction * element.clientWidth * PAGE_FRACTION,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [ref],
  );

  return { atStart: edges.start, atEnd: edges.end, onScroll: measure, page };
}
