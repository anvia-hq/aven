import { useRuntimes } from "./use-runtimes";

export function useRuntime(runtimeId: string) {
  const { runtimes, loaded } = useRuntimes();
  return { runtime: runtimes.find((candidate) => candidate.id === runtimeId), loaded };
}
