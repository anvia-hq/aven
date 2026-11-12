import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

type Loaded<T> = { data: T; error: null } | { data: null; error: string } | null;

type Options = {
  key?: string;
  pollMs?: number;
  resetOn?: unknown;
  refreshKey?: unknown;
};

export function useRequest<T>(
  path: string | null,
  { key = path ?? undefined, pollMs, resetOn, refreshKey }: Options = {},
): Loaded<T> {
  const [answer, setAnswer] = useState<{ key: string | undefined; loaded: Loaded<T> } | null>(null);

  useEffect(() => setAnswer(null), [resetOn]);

  useEffect(() => {
    if (!path) return;

    let current = true;
    const look = async () => {
      try {
        const data = await api<T>(path);

        if (current) setAnswer({ key, loaded: { data, error: null } });
      } catch (failure) {
        if (current) setAnswer({ key, loaded: { data: null, error: errorMessage(failure) } });
      }
    };
    void look();
    const timer = pollMs ? setInterval(() => void look(), pollMs) : undefined;
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [path, key, pollMs, refreshKey]);

  return answer && answer.key === key ? answer.loaded : null;
}
