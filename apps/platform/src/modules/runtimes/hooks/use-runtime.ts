import { useRuntimes } from "./use-runtimes";

export function useRuntime(runtimeId: string) {
  const { computers, loaded } = useRuntimes();
  return { runtime: computers.find((candidate) => candidate.id === runtimeId), loaded };
}
