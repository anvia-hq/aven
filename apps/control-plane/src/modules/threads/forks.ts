import { FORKS_PER_THREAD, forkPrompt, type ForkView } from "@aven/protocol/forks";
import type { RunThreadInfo } from "@aven/protocol/runtime-wire";
import { threadBranch } from "@aven/protocol/thread-branch";
import { threadTitleFrom, threadTurns } from "@aven/protocol/threads";

import { UnprocessableError } from "../../errors";
import type { RunManager } from "../runs/service";
import type { ThreadMessages } from "./messages";
import { threadsService } from "./service";

/** What the agent of a run does with forks of its thread (decision 0135). */
export type ThreadForks = {
  /** Makes a thread forked from the run's, which starts working on the task at once. */
  start(
    thread: RunThreadInfo,
    input: { task: string; context: string; title?: string },
  ): Promise<{ id: string; title: string }>;
  /** Looks at one of the run's thread's forks. */
  status(thread: RunThreadInfo, id: string): Promise<ForkView>;
};

export function createThreadForks({
  runs,
  messages,
}: {
  runs: RunManager;
  messages: Pick<ThreadMessages, "start">;
}): ThreadForks {
  // A fork of this thread, and no other thread: the id comes from the agent.
  const forkOf = async (thread: RunThreadInfo, id: string) => {
    const fork = await threadsService.get(thread.organizationId, id);
    if (!fork || fork.parentThreadId !== thread.id) {
      throw new UnprocessableError("That is not a fork of this thread");
    }
    return fork;
  };

  return {
    async start(thread, { task, context, title }) {
      const parent = await threadsService.require(thread.organizationId, thread.id);
      if (parent.parentThreadId) {
        throw new UnprocessableError(
          "A fork cannot fork: do the work in this thread or tell the person.",
        );
      }
      if ((await threadsService.liveForks(parent.id)) >= FORKS_PER_THREAD) {
        throw new UnprocessableError(
          `This thread has ${FORKS_PER_THREAD} forks that are not archived. Wait for one to finish and have the person archive it.`,
        );
      }
      // The thread is its creator's alone to drive, so a fork is theirs too.
      const userId = parent.createdBy;
      const fork = await threadsService.create(
        parent.organizationId,
        userId,
        { projectId: parent.projectId, title: title ?? threadTitleFrom(task) },
        { parentThreadId: parent.id, runtimeId: parent.runtimeId },
      );
      const prompt = forkPrompt(
        { task, context },
        { branch: threadBranch(fork.id), parentTitle: parent.title },
      );
      try {
        await messages.start(parent.organizationId, userId, fork.id, { prompt });
      } catch (error) {
        // A fork that never ran would only sit in the person's list.
        await threadsService
          .update({ organizationId: parent.organizationId, userId }, fork.id, { state: "archived" })
          .catch(() => undefined);
        throw error;
      }
      return { id: fork.id, title: fork.title };
    },

    async status(thread, id) {
      const fork = await forkOf(thread, id);
      const history = await runs.history(fork);
      const last = threadTurns(history).turns.findLast((turn) => turn.role === "assistant");
      return {
        id: fork.id,
        title: fork.title,
        running: runs.isRunning(fork.id),
        archived: fork.state === "archived",
        error: fork.lastError,
        lastMessage: last?.text ?? "",
      };
    },
  };
}
