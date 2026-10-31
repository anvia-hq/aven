import { useNavigate, useRouterState } from "@tanstack/react-router";

import { toast } from "@/components/toast";
import { attempt, postJson } from "@/lib/api";

import type { Thread } from "../types";
import { useThreads } from "./use-threads";

// Archiving takes a thread out of the sidebar; its conversation and sandbox are left as they are.
// The person reading it is taken back to the new thread page.
export function useArchiveThread() {
  const { refresh } = useThreads();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return async function archive(thread: Thread) {
    const archived = await attempt("Could not archive the thread", () =>
      postJson<Thread>(`/threads/${thread.id}`, { state: "archived" }, "PATCH"),
    );
    if (!archived) return;
    toast.add({ title: "Thread archived", description: thread.title, type: "success" });
    if (pathname === `/threads/${thread.id}`) void navigate({ to: "/threads" });
    await refresh();
  };
}
