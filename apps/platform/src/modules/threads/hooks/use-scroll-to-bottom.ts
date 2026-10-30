import { useCallback, useEffect, useRef } from "react";

// Within this many pixels of the end, the reader counts as following the conversation.
const FOLLOW_DISTANCE = 80;

// Keeps the returned ref's scroll container at its end as its content grows, so a streaming answer
// stays in view, with the container's bottom padding. Growth is watched, not messages: streamed
// text is paced out between events (decision 0028). A reader who has scrolled up is left where
// they are, until a new message is added: that takes them back to the end.
export function useScrollToBottom(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const seen = useRef(0);
  // Where the end was when this hook last scrolled there.
  const lastEnd = useRef(0);

  // Goes to the end if the reader is following, or `resume`s following. Moving away is noticed
  // here, from the position itself: a scroll event arrives a frame late, after the content may
  // have grown again.
  const stick = useCallback((element: HTMLDivElement, resume = false) => {
    // Content can shrink under the reader (late layout), which moves the end up with it.
    const end = Math.min(lastEnd.current, element.scrollHeight - element.clientHeight);
    if (resume) following.current = true;
    else if (end - element.scrollTop > FOLLOW_DISTANCE) following.current = false;
    if (!following.current) return;
    element.scrollTop = element.scrollHeight;
    lastEnd.current = element.scrollHeight - element.clientHeight;
  }, []);

  // Scrolling back to the end resumes following.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (distance < FOLLOW_DISTANCE) following.current = true;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    // Scrolled on the next frame: scrolling inside the observer's callback lays the page out again
    // within the same frame, which the browser reports as a ResizeObserver loop.
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
