import type { MemoryStore } from "@anvia/core";
import type { CallMethod, RepoAccess, RunThreadInfo } from "@aven/protocol/runtime-wire";

import { parseAppendParams, parseMemoryParams, parseReplacePrefixParams } from "./wire";

/** What answering a runtime's call needs to know of the run it names. */
export type CallRun = {
  thread: RunThreadInfo;
  /** The turns of the transcript already stored, so a call sent again after a dropped reply adds nothing. */
  appended: Set<number>;
};

export type RuntimeCallContext = {
  /** A live run of the connection the call came over. */
  findRun(runId: string): CallRun | undefined;
  store: MemoryStore;
  repoAccess(threadId: string): Promise<RepoAccess>;
};

function requireCompaction(store: MemoryStore) {
  if (!store.compaction) throw new Error("This conversation store does not support compaction");
  return store.compaction;
}

// Every call names a run, which must be a live one of the connection it came over.
function liveRun(params: unknown, findRun: RuntimeCallContext["findRun"]) {
  const { runId } = parseMemoryParams(params);
  const run = findRun(runId);
  if (!run) throw new Error("Unknown or finished run");
  return { runId, run };
}

// Answers what a runtime asks of the control plane: the conversation, which the control plane
// owns, and how to clone the repository. Both only for the run's own thread; the scope comes from
// our record of the run, never from what the runtime sends.
export async function answerRuntimeCall(
  method: CallMethod,
  params: unknown,
  { findRun, store, repoAccess }: RuntimeCallContext,
) {
  const { runId, run } = liveRun(params, findRun);
  if (method === "repo.access") return repoAccess(run.thread.id);
  const scope = {
    sessionId: run.thread.id,
    metadata: { organizationId: run.thread.organizationId },
  };
  switch (method) {
    case "memory.load":
      return store.load({ scope });
    case "memory.append": {
      const { turn, messages } = parseAppendParams(params);
      // A runtime that did not hear the reply asks again.
      if (run.appended.has(turn)) return null;
      run.appended.add(turn);
      try {
        await store.append({ scope, runId, turn, messages });
      } catch (error) {
        run.appended.delete(turn);
        throw error;
      }
      return null;
    }
    case "memory.clear":
      await store.clear({ scope });
      return null;
    case "memory.snapshot":
      return requireCompaction(store).snapshot({ scope });
    case "memory.replacePrefix": {
      const { revision, messageCount, replacement } = parseReplacePrefixParams(params);
      return requireCompaction(store).replacePrefix({
        scope,
        runId,
        revision,
        messageCount,
        replacement,
      });
    }
  }
}
