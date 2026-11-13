import { useEffect, useRef, useState } from "react";

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
  const previous = useRef<Held<T>[]>([]);
  const scheduled = useRef(new Set<string>());
  const [expired, setExpired] = useState<ReadonlySet<string>>(new Set());
  const live = new Set(items.map((item) => item.id));
  const shown: Held<T>[] = items.map((item) => ({ item, leaving: false }));

  previous.current.forEach((entry, index) => {
    if (live.has(entry.item.id) || expired.has(entry.item.id)) return;

    shown.splice(Math.min(index, shown.length), 0, { item: entry.item, leaving: true });
  });
  previous.current = shown;

  const leavingKey = shown
    .filter((entry) => entry.leaving)
    .map((entry) => entry.item.id)
    .join();
  const liveKey = items.map((item) => item.id).join();

  useEffect(() => {
    for (const id of leavingKey.split(",").filter(Boolean)) {
      if (scheduled.current.has(id)) continue;

      scheduled.current.add(id);
      setTimeout(() => {
        scheduled.current.delete(id);
        setExpired((now) => new Set(now).add(id));
      }, ms);
    }
  }, [leavingKey, ms]);

  useEffect(() => {
    const ids = new Set(liveKey.split(",").filter(Boolean));
    setExpired((now) => {
      const kept = [...now].filter((id) => !ids.has(id));
      return kept.length === now.size ? now : new Set(kept);
    });
  }, [liveKey]);

  return shown;
}
