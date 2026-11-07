import { useLocalStorage } from "@/hooks/use-local-storage";

import type { DiffLayout, DiffScope } from "../types";

export function useDiffPreferences() {
  const [scope, setScope] = useLocalStorage<DiffScope>("aven.diff-scope", "turn");
  const [layout, setLayout] = useLocalStorage<DiffLayout>("aven.diff-layout", "unified");
  return { scope, setScope, layout, setLayout };
}
