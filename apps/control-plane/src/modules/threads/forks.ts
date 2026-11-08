import { FORKS_PER_THREAD, forkPrompt } from "@aven/protocol/forks";
import { threadBranch } from "@aven/protocol/thread-branch";
import { threadTitleFrom, threadTurns } from "@aven/protocol/threads";

import { ConflictError, UnprocessableError } from "../../errors";
import type { RunManager } from "../runs/service";
import { threadsService } from "./service";
import type { ThreadForks, ThreadMessages } from "./types";
import type { RunThreadInfo } from "@aven/protocol/types";

export function createThreadForks({
  runs,
  messages,
}: {
  runs: RunManager;
  messages: Pick<ThreadMessages, "start" | "send">;
}): ThreadForks {
  const forkOf = async (thread: RunThreadInfo, id: string) => {
    const fork = await threadsService.get(thread.organizationId, id);
    if (!fork || fork.parentThreadId !== thread.id) {
      throw new UnprocessableError("That is not a fork of this thread");
    }
    return fork;
  };

  const waiting = new Map<string, string[]>();
  const sendNote = async (
    parent: { id: string; organizationId: string; createdBy: string },
    prompt: string,
  ) => {
    try {
      await messages.send(
        parent.organizationId,
        parent.createdBy,
        parent.id,
        { prompt },
        { onPersonsWord: false },
      );
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        console.warn(`Could not tell thread ${parent.id} about a fork:`, error);
        return;
      }
      const queued = waiting.get(parent.id) ?? [];
      queued.push(prompt);
      waiting.set(parent.id, queued);
    }
  };
  const deliverWaiting = async (
    thread: { id: string; organizationId: string },
    outcome: string,
  ) => {
    if (outcome !== "done" && outcome !== "failed") return;
    const prompts = waiting.get(thread.id);
    if (!prompts?.length) return;
    const parent = await threadsService.get(thread.organizationId, thread.id);
    if (!parent || parent.awaitingAnswer) return;
    waiting.delete(thread.id);
    for (const prompt of prompts) await sendNote(parent, prompt);
  };

  const turns = new Map<string, Promise<unknown>>();
  const inTurn = <T>(parentId: string, work: () => Promise<T>) => {
    const turn = (turns.get(parentId) ?? Promise.resolve()).catch(() => undefined).then(work);
    turns.set(parentId, turn);
    return turn.finally(() => {
      if (turns.get(parentId) === turn) turns.delete(parentId);
    });
  };

  const start: ThreadForks["start"] = async (thread, { task, context, title }) => {
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
      await threadsService
        .update({ organizationId: parent.organizationId, userId }, fork.id, { state: "archived" })
        .catch(() => undefined);
      throw error;
    }
    return { id: fork.id, title: fork.title };
  };

  return {
    start: (thread, input) => inTurn(thread.id, () => start(thread, input)),

    async ended(fork, ending) {
      if (!fork.parentThreadId) {
        await deliverWaiting(fork, ending.outcome);
        return;
      }
      if (ending.outcome === "cancelled") return;
      const parentWorking = runs.isRunning(fork.parentThreadId);
      const siblings = await threadsService.liveForkList(fork.parentThreadId);
      if (!parentWorking && siblings.some((other) => runs.isRunning(other.id))) return;
      const parent = await threadsService.get(fork.organizationId, fork.parentThreadId);
      const forked = await threadsService.get(fork.organizationId, fork.id);
      if (!parent || !forked) return;
      const how = {
        done: "is done",
        failed: "failed",
        question: "stopped to ask the person a question",
      }[ending.outcome];
      const prompt = parentWorking
        ? `[fork] Your fork "${forked.title}" (${forked.id}) ${how}. Look at it with fork_status, and take its changes with take_fork_changes when you want them.`
        : `[fork] Your fork "${forked.title}" (${forked.id}) ${how}, and none of your forks is going now: ${siblings.map((other) => `"${other.title}" (${other.id})`).join(", ")}. Look at each with fork_status. If the person asked you to take their work or open pull requests, do that now, checking each change first; otherwise tell them the forks are done and ask what they want taken.`;
      await sendNote(parent, prompt);
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
