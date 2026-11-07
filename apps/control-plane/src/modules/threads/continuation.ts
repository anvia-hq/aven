import {
  continuationPrompt,
  CONTINUATION_PATCH_NAME,
  type ContinuationPatch,
} from "@aven/protocol/continuation";
import { threadBranch } from "@aven/protocol/thread-branch";
import { threadTurns } from "@aven/protocol/threads";

import { ConflictError, UnprocessableError } from "../../errors";
import type { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import type { RunManager } from "../runs/service";
import type { ThreadMessages } from "./messages";
import type { SendMessageBody } from "./schema";
import { threadsService, type Viewer } from "./service";

/** The model the first run uses: the sender's choice, or else their default. */
export type ModelSelection = Pick<SendMessageBody, "providerId" | "modelId" | "reasoningEffort">;

/** The changes of a thread, as a patch, read through its runner; null when they cannot be had. */
export type PatchOf = (
  organizationId: string,
  threadId: string,
) => Promise<{ patch: string; truncated: boolean } | null>;

// A patch past this is not carried: a message's files add up to 10 MiB, and the base64 a patch is
// sent in is a third larger, so this leaves room.
const PATCH_MAX_BYTES = 4 * 1024 * 1024;

/**
 * A thread that carries on another's work on a different runner (decision 0149). A thread's
 * workspace, journal and sandbox stay on the runner it began on, so nothing is moved: the new
 * thread, in the same project, starts from a fresh clone, gets the old thread's changes as a patch
 * (its commits and uncommitted work, read through the old runner) and a summary of what was said.
 */
export function createThreadContinuation({
  runs,
  hub,
  messages,
  patchOf,
  putAway,
}: {
  runs: Pick<RunManager, "history" | "isRunning">;
  hub: Pick<RuntimeHub, "isOnline">;
  messages: Pick<ThreadMessages, "start">;
  patchOf: PatchOf;
  putAway: (thread: { id: string; runtimeId: string }) => unknown;
}) {
  return {
    async continueOn(
      viewer: Viewer,
      threadId: string,
      runtimeId: string,
      selection: ModelSelection = {},
    ) {
      const old = await threadsService.owned(viewer, threadId);
      if (old.runtimeId === runtimeId) {
        throw new ConflictError("This thread is on that runner already");
      }
      const runner = await runtimesService.get(viewer.organizationId, runtimeId);
      if (!runner) throw new UnprocessableError("Runner not found");
      if (!hub.isOnline(runtimeId)) throw new ConflictError(`${runner.name} is offline`);
      if (runs.isRunning(old.id)) {
        throw new ConflictError("The agent is working on this thread: stop it or wait first");
      }
      if (old.awaitingAnswer) throw new ConflictError("Answer the agent's question first");

      const found = await patchOf(viewer.organizationId, old.id).catch(() => null);
      const bytes = found && !found.truncated ? Buffer.from(found.patch) : null;
      const carried = bytes && bytes.length <= PATCH_MAX_BYTES ? bytes : null;
      let patch: ContinuationPatch = "unavailable";
      if (carried) patch = carried.length > 0 ? "attached" : "none";

      const { turns, earlier } = threadTurns(await runs.history(old));
      const created = await threadsService.create(
        viewer.organizationId,
        viewer.userId,
        { projectId: old.projectId, title: old.title },
        { runtimeId },
      );
      const prompt = continuationPrompt({
        oldTitle: old.title,
        oldBranch: threadBranch(old.id),
        newBranch: threadBranch(created.id),
        runnerName: runner.name,
        turns,
        earlier,
        patch,
      });
      try {
        const body: SendMessageBody = { prompt, ...selection };
        if (patch === "attached" && carried) {
          body.attachments = [
            {
              name: CONTINUATION_PATCH_NAME,
              mediaType: "text/x-diff",
              data: carried.toString("base64"),
            },
          ];
        }
        await messages.start(viewer.organizationId, viewer.userId, created.id, body);
      } catch (error) {
        await threadsService
          .update(viewer, created.id, { state: "archived" })
          .catch(() => undefined);
        putAway({ id: created.id, runtimeId: created.runtimeId });
        throw error;
      }
      return created;
    },
  };
}

export type ThreadContinuation = ReturnType<typeof createThreadContinuation>;
