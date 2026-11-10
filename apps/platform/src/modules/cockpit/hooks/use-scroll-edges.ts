import { useCallback, useEffect, useRef, useState } from "react";

export function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const start = element.scrollLeft > 1;
    const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setEdges((current) =>
      current.start === start && current.end === end ? current : { start, end },
    );
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [measure]);

  return { ref, edges, onScroll: measure };
}
