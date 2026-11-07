import { useCallback, useEffect, useRef } from "react";

const FOLLOW_DISTANCE = 80;

export function useScrollToBottom(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const seen = useRef(0);
  const lastEnd = useRef(0);

  const stick = useCallback((element: HTMLDivElement, resume = false) => {
    const end = Math.min(lastEnd.current, element.scrollHeight - element.clientHeight);
    if (resume) following.current = true;
    else if (end - element.scrollTop > FOLLOW_DISTANCE) following.current = false;
    if (!following.current) return;
    element.scrollTop = element.scrollHeight;
    lastEnd.current = element.scrollHeight - element.clientHeight;
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distance < FOLLOW_DISTANCE) following.current = true;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        stick(element);
      });
    });
    const content = element.firstElementChild;
    if (content) observer.observe(content);
    return () => {
      element.removeEventListener("scroll", onScroll);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [stick]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const added = count > seen.current;
    seen.current = count;
    stick(element, added);
  }, [count, stick]);

  return ref;
}
