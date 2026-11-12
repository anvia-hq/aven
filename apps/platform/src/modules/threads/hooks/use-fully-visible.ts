import { useEffect, useState, type RefObject } from "react";

export function useFullyVisible(container: RefObject<HTMLElement | null>, key: string) {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    const root = container.current;

    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) =>
        setHidden((current) => {
          const next = new Set(current);

          for (const entry of entries) {
            const index = Array.from(root.children).indexOf(entry.target);

            if (entry.intersectionRatio < 0.99) next.add(index);
            else next.delete(index);
          }

          return next;
        }),
      { root, rootMargin: "4px", threshold: [0, 0.99] },
    );

    for (const child of root.children) observer.observe(child);

    return () => {
      observer.disconnect();
      setHidden(new Set());
    };
  }, [container, key]);

  return hidden;
}
