import { useEffect, useRef } from "react";

// Writes an element's height, as it changes, to a CSS variable on another element. The composer
// floats over the conversation and grows with a pull-request bar, attachments or a question, so
// `ready` is when both elements are on the page. What the conversation leaves free below its messages must follow it, not a guess.
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
