import { toast } from "@aven/ui/toast";
import { attempt, postJson } from "@/lib/api";

import type { Thread } from "../types";
import { useThreads } from "./use-threads";

export function useDriveThread() {
  const { refresh } = useThreads();

  return async function drive(thread: Thread, days: number | null) {
    const updated = await attempt("Could not change multiplayer", () =>
      postJson<Thread>(`/threads/${thread.id}`, { driving: days }, "PATCH"),
    );

    if (!updated) return;

    toast.add({
      title: days === null ? "Multiplayer is off" : `Teammates can message it for ${days} days`,
      description: thread.title,
      type: "success",
    });
    await refresh();
  };
}
