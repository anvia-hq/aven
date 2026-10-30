import { useLocalStorage } from "@/hooks/use-local-storage";

import type { ExplorerState } from "../types";

const INITIAL: ExplorerState = { expanded: [], open: [], active: null, treeShown: true };

// Which folders and files a thread has open, kept for the next visit. Each thread has its own, so
// the caller mounts this once per thread.
export function useExplorerState(threadId: string) {
  const [state, setState] = useLocalStorage<ExplorerState>(`aven.files.${threadId}`, INITIAL);
  // What is stored could be from an older shape.
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
      // Closing the tab that shows moves to its neighbour.
      const at = safe.open.indexOf(path);
      const active =
        safe.active === path ? (open[Math.min(at, open.length - 1)] ?? null) : safe.active;
      setState({ ...safe, open, active });
    },
    toggleTree: () => setState({ ...safe, treeShown: !safe.treeShown }),
  };
}
