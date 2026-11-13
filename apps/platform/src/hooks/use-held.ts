import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Held } from "./types";

export function useHeldValue<T>(value: T | null | undefined, ms: number) {
  const present = value !== null && value !== undefined;
  const last = useRef<T | null>(null);
  const [gone, setGone] = useState(!present);

  if (present) last.current = value;

  useEffect(() => {
    if (present) {
      setGone(false);
      return;
    }

    const timer = setTimeout(() => setGone(true), ms);
    return () => clearTimeout(timer);
  }, [present, ms]);

  const lingering = gone ? null : last.current;
  const shown = present ? value : lingering;
  return { shown, leaving: !present && shown !== null };
}

export function useHeldList<T extends { id: string }>(items: T[], ms: number): Held<T>[] {
  const [stale, setStale] = useState<{ item: T; index: number }[]>([]);
  const seen = useRef<T[]>(items);
  const key = items.map((item) => item.id).join();

  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = items;
    const present = (id: string) => items.some((item) => item.id === id);
    const left = before
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !present(item.id));
    setStale((now) => [...now.filter(({ item }) => !present(item.id)), ...left]);

    if (left.length === 0) return;

    setTimeout(
      () =>
        setStale((now) => now.filter(({ item }) => !left.some((gone) => gone.item.id === item.id))),
      ms,
    );
  }, [key]);

  const shown: Held<T>[] = items.map((item) => ({ item, leaving: false }));

  for (const { item, index } of stale) {
    if (items.some((live) => live.id === item.id)) continue;

    shown.splice(Math.min(index, shown.length), 0, { item, leaving: true });
  }

  return shown;
}
