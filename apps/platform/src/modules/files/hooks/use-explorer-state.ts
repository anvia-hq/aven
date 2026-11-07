import { useLocalStorage } from "@/hooks/use-local-storage";

import type { ExplorerState } from "../types";

const INITIAL: ExplorerState = { expanded: [], open: [], active: null, treeShown: true };

export function useExplorerState(threadId: string) {
  const [state, setState] = useLocalStorage<ExplorerState>(`aven.files.${threadId}`, INITIAL);
  const safe: ExplorerState = { ...INITIAL, ...state };

  return {
    ...safe,
    toggleFolder: (path: string) =>
      setState({
        ...safe,
        expanded: safe.expanded.includes(path)
          ? safe.expanded.filter((open) => open !== path)
          : [...safe.expanded, path],
      }),
    openFile: (path: string) =>
      setState({
        ...safe,
        open: safe.open.includes(path) ? safe.open : [...safe.open, path],
        active: path,
      }),
    select: (path: string) => setState({ ...safe, active: path }),
    closeFile: (path: string) => {
      const open = safe.open.filter((file) => file !== path);
      const at = safe.open.indexOf(path);
      const active =
        safe.active === path ? (open[Math.min(at, open.length - 1)] ?? null) : safe.active;
      setState({ ...safe, open, active });
    },
    toggleTree: () => setState({ ...safe, treeShown: !safe.treeShown }),
  };
}
