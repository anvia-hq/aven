import { takeFork } from "./take-fork";
import type { ForkHost } from "@aven/agents/tools/types";
import type { ForkView, RuntimeCalls } from "@aven/protocol/types";
import type { ThreadWorkspaces } from "./types";

type ForkCall = <M extends "fork.start" | "fork.status">(
  method: M,
  params: RuntimeCalls[M]["params"],
) => Promise<RuntimeCalls[M]["result"]>;

export function createForkHost({
  runId,
  thread,
  sandbox,
  call,
  redact,
}: {
  runId: string;
  thread: { id: string };
  sandbox: Pick<ThreadWorkspaces, "workspace" | "paths" | "takeFork">;
  call: ForkCall;
  redact?: (text: string) => string;
}): ForkHost {
  const status = async (id: string): Promise<ForkView> => {
    const view = await call("fork.status", { runId, id });
    return redact ? { ...view, lastMessage: redact(view.lastMessage) } : view;
  };
  return {
    start: (input) => call("fork.start", { runId, ...input }),
    status,
    async take(id) {
      await status(id);
      return sandbox.takeFork ? sandbox.takeFork(thread.id, id) : takeFork(sandbox, thread.id, id);
    },
  };
}
