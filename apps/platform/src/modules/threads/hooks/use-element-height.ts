import { useEffect, useRef } from "react";

export function useElementHeight<T extends HTMLElement, U extends HTMLElement>(
  variable: string,
  ready: boolean,
) {
  const source = useRef<T>(null);
  const target = useRef<U>(null);

  useEffect(() => {
    if (!ready) return;
    const from = source.current;
    const to = target.current;
    if (!from || !to) return;
    const write = () => to.style.setProperty(variable, `${from.offsetHeight}px`);
    write();
    const observer = new ResizeObserver(write);
    observer.observe(from);
    return () => observer.disconnect();
  }, [variable, ready]);

  return { source, target };
}
