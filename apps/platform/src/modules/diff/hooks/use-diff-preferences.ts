import { useAtom } from "jotai";

import { useLocalStorage } from "@/hooks/use-local-storage";

import { diffScopeAtom } from "../atoms/diff-scope-atom";
import type { DiffLayout } from "../types";

export function useDiffPreferences() {
  const [scope, setScope] = useAtom(diffScopeAtom);
  const [layout, setLayout] = useLocalStorage<DiffLayout>("aven.diff-layout", "unified");
  return { scope, setScope, layout, setLayout };
}
