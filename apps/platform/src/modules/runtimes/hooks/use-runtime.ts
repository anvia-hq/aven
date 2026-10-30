import { useRuntimes } from "./use-runtimes";

// One runtime of the organization; undefined once loaded means it was revoked.
export function useRuntime(runtimeId: string) {
  const { runtimes, loaded } = useRuntimes();
  return { runtime: runtimes.find((candidate) => candidate.id === runtimeId), loaded };
}
