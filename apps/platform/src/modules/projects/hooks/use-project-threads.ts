import { useThreads } from "@/modules/threads/hooks/use-threads";

export function useProjectThreads(projectId: string) {
  return useThreads().filter((thread) => thread.projectId === projectId);
}
