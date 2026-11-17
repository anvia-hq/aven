import { useCallback, useEffect, useRef } from "react";

const FOLLOW_DISTANCE = 80;
const GLIDE_FALLBACK_MS = 600;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useScrollToBottom(count: number, outgoing = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const seen = useRef(0);
  const seenOutgoing = useRef(0);
  const lastEnd = useRef(0);
  const gliding = useRef(false);

  const stick = useCallback((element: HTMLDivElement, resume = false) => {
    const end = Math.min(lastEnd.current, element.scrollHeight - element.clientHeight);

    if (resume) following.current = true;
    else if (end - element.scrollTop > FOLLOW_DISTANCE) following.current = false;

    if (!following.current || gliding.current) return;

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
    const observer = new ResizeObserver(() => stick(element));
    const content = element.firstElementChild;

    if (content) observer.observe(content);

    return () => {
      element.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [stick]);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    const added = count > seen.current;
    const sent = outgoing > seenOutgoing.current;
    seen.current = count;
    seenOutgoing.current = outgoing;

    if (!sent || prefersReducedMotion()) {
      stick(element, added);
      return;
    }

    following.current = true;
    gliding.current = true;
    const settle = () => {
      element.removeEventListener("scrollend", settle);
      clearTimeout(fallback);
      gliding.current = false;
      stick(element);
    };
    const fallback = setTimeout(settle, GLIDE_FALLBACK_MS);
    element.addEventListener("scrollend", settle);
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [count, outgoing, stick]);

  return ref;
}
