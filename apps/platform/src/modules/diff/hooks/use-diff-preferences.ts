import { useLocalStorage } from "@/hooks/use-local-storage";

import type { DiffLayout, DiffScope } from "../types";

// What a person last chose for the diff, kept for the next thread and the next visit.
export function useDiffPreferences() {
  const [scope, setScope] = useLocalStorage<DiffScope>("aven.diff-scope", "turn");
  const [layout, setLayout] = useLocalStorage<DiffLayout>("aven.diff-layout", "unified");
  return { scope, setScope, layout, setLayout };
}
