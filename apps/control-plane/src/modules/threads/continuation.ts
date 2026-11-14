import { continuationPrompt, CONTINUATION_PATCH_NAME } from "@aven/protocol/continuation";
import { threadBranch } from "@aven/protocol/thread-branch";
import { threadTurns } from "@aven/protocol/threads";
import type { ContinuationPatch } from "@aven/protocol/types";

import { ConflictError, UnprocessableError } from "@aven/server-kit/errors";
import type { ModelSelection } from "../providers/types";
import type { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import type { RunManager } from "../runs/service";
import type { SendMessageBody } from "./schema";
import { threadsService } from "./service";
import type { PatchOf, ThreadMessages, Viewer } from "./types";

const PATCH_MAX_BYTES = 4 * 1024 * 1024;

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

      const runner = await runtimesService.get(viewer.organizationId, runtimeId, viewer.userId);

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
        { projectId: old.projectId, title: old.title, backend: old.agentBackend },
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
