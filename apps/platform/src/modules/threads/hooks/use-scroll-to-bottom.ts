import { useEffect, useRef } from "react";

// Scrolls the returned ref's element into view whenever `dependency` changes.
export function useScrollToBottom(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [dependency]);

  return ref;
}
