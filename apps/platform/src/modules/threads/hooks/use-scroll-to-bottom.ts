import { useEffect, useRef } from "react";

// Within this many pixels of the end, the reader counts as following the conversation.
const FOLLOW_DISTANCE = 80;

// Keeps the returned ref's scroll container at its end as `dependency` changes, so a streaming
// answer stays in view, with the container's bottom padding. A reader who has scrolled up is left
// where they are, until a new message is added: that takes them back to the end.
export function useScrollToBottom(dependency: unknown, count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const seen = useRef(0);
  // Where the end was when this hook last scrolled there.
  const lastEnd = useRef(0);

  // Scrolling back to the end resumes following. Moving away is noticed in the effect below, from
  // the position itself: a scroll event arrives a frame late, after the next update may have run.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distance < FOLLOW_DISTANCE) following.current = true;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Content can shrink under the reader (late layout), which moves the end up with it.
    const end = Math.min(lastEnd.current, element.scrollHeight - element.clientHeight);
    if (count > seen.current) following.current = true;
    else if (end - element.scrollTop > FOLLOW_DISTANCE) following.current = false;
    seen.current = count;
    if (!following.current) return;
    element.scrollTop = element.scrollHeight;
    lastEnd.current = element.scrollHeight - element.clientHeight;
  }, [dependency, count]);

  return ref;
}
