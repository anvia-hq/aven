import { useAtomValue } from "jotai";
import { useMemo } from "react";

import { threadsAtom } from "../atoms/threads-atom";

// All threads, most recently updated first.
export function useThreads() {
  const threads = useAtomValue(threadsAtom);
  return useMemo(
    () => [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [threads],
  );
}
