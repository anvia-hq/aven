import { useState } from "react";

import { toast } from "@/components/toast";
import { postJson, attempt } from "@/lib/api";
import { useRequest } from "@/hooks/use-request";

import type { RemovedLeftovers, RunnerLeftovers } from "../types";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function useLeftovers() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [removing, setRemoving] = useState(false);
  const answer = useRequest<RunnerLeftovers[]>("/platform/leftovers", { refreshKey });

  async function remove(
    runner: RunnerLeftovers,
    request: { containers: string[]; images: string[] },
  ) {
    if (removing) return;
    setRemoving(true);
    const result = await attempt("Could not remove them", () =>
      postJson<RemovedLeftovers>(`/platform/leftovers/${runner.runtimeId}/remove`, request),
    ).finally(() => setRemoving(false));
    if (!result) return;
    const removed = [
      result.removedContainers > 0 && plural(result.removedContainers, "container"),
      result.removedImages > 0 && plural(result.removedImages, "image"),
    ].filter(Boolean);
    if (removed.length > 0) {
      toast.add({
        title: `Removed ${removed.join(" and ")}`,
        description: runner.name,
        type: "success",
      });
    }
    if (result.failed.length > 0) {
      toast.add({
        title: `Could not remove ${plural(result.failed.length, "item")}`,
        description: result.failed[0]?.reason,
        type: "error",
      });
    }
    setRefreshKey((key) => key + 1);
  }

  return {
    runners: answer?.data ?? null,
    error: answer?.error ?? null,
    refresh: () => setRefreshKey((key) => key + 1),
    remove,
    removing,
  };
}
