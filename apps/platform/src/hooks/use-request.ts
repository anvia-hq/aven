import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

/** The answer to a request: what came back, or what to tell the user. Null until there is one. */
type Loaded<T> = { data: T; error: null } | { data: null; error: string } | null;

type Options = {
  /**
   * Which question an answer is for: one asked under another key is not shown. Defaults to the
   * path; a caller whose answers all stand for the same thing passes a constant.
   */
  key?: string;
  /** Ask again this often, while set. */
  pollMs?: number;
  /** Changing this forgets the answer, as something else is now being asked about. */
  resetOn?: unknown;
  /** Changing this asks again now. */
  refreshKey?: unknown;
};

// Reads `path` (nothing while it is null) and again on every change of what it depends on, keeping
// only answers to the latest request: one that arrives after the question changed is dropped.
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
