import { pendingQuestion } from "@aven/protocol/events";
import { BOT_THREADS_LISTED, threadTitleFrom, threadTurns } from "@aven/protocol/threads";

import { UnprocessableError } from "../../errors";
import { projectsService } from "../projects/service";
import type { RunManager } from "../runs/service";
import { threadsService } from "./service";
import type { WatchedRun, Watcher } from "../thread-watch/types";
import type { BotActor, BotThreads, PutAwayThread, ThreadMessages } from "./types";
import type { BotThreadView } from "@aven/protocol/types";

type ThreadRow = Awaited<ReturnType<typeof threadsService.readableForPerson>>;

const lastActivityAt = (activity?: { lastEventAt: number }) =>
  activity && new Date(activity.lastEventAt).toISOString();

const NO_PROJECT = "There is no project with that id. Use list_projects.";
const QUESTION_MAX = 1000;

export function createBotThreads({
  runs,
  messages,
  watch,
  putAway,
}: {
  runs: Pick<RunManager, "isRunning" | "history" | "cancel" | "activity">;
  messages: Pick<ThreadMessages, "send">;
  watch: {
    watch(
      threadId: string,
      watcher: Watcher,
      options: { run: WatchedRun; personsWord: boolean },
    ): Promise<void>;
    settle(threadId: string, botId: string): Promise<void>;
    followUp(threadId: string, botId: string): Promise<"ok" | "unwatched" | "spent">;
    giveBack(threadId: string, botId: string): Promise<void>;
  };
  putAway: PutAwayThread;
}): BotThreads {
  const repositories = async (userId: string) =>
    new Map(
      (await projectsService.listForPerson(userId)).map((project) => [
        project.id,
        project.repoFullName,
      ]),
    );

  const viewOf = (userId: string, thread: ThreadRow, repository: string): BotThreadView => {
    const mine = thread.createdBy === userId;
    return {
      id: thread.id,
      title: thread.title,
      projectId: thread.projectId,
      repository,
      state: thread.state,
      mine,
      createdBy: mine ? undefined : thread.createdByName,
      running: runs.isRunning(thread.id),
      lastActivityAt: lastActivityAt(runs.activity(thread.id)),
      awaitingAnswer: thread.awaitingAnswer,
      pullRequests: thread.pullRequests.map(({ number, url, title, state }) => ({
        number,
        url,
        title,
        state,
      })),
      updatedAt: thread.updatedAt.toISOString(),
    };
  };

  const view = async (userId: string, thread: ThreadRow) =>
    viewOf(userId, thread, (await repositories(userId)).get(thread.projectId) ?? "");

  const watchRun = async (actor: BotActor, id: string) => {
    const run = runs.activity(id)?.startedAt ?? null;
    await watch
      .watch(id, actor, { run, personsWord: actor.via === "person" })
      .catch((error: unknown) => console.warn(`Could not watch thread ${id} for its bot:`, error));
  };

  const followingUp = async <T>(actor: BotActor, id: string, act: () => Promise<T>) => {
    if (actor.via === "person") return act();
    const allowed = await watch.followUp(id, actor.botId);
    if (allowed === "unwatched") {
      throw new UnprocessableError(
        "You did not send this thread its run, so continue or stop it only when the person's own message asks you to.",
      );
    }
    if (allowed === "spent") {
      throw new UnprocessableError(
        "You have followed this thread up as often as you may without the person. Tell the person what it needs instead.",
      );
    }
    try {
      return await act();
    } catch (error) {
      await watch.giveBack(id, actor.botId).catch(() => undefined);
      throw error;
    }
  };

  const owned = async (actor: BotActor, id: string) => {
    const thread = await threadsService.ownedForPerson(actor.userId, id);
    if (actor.via === "note" && thread.state === "archived") {
      throw new UnprocessableError("This thread is archived. Leave it, or tell the person.");
    }
    return thread;
  };

  return {
    async projects(userId) {
      return (await projectsService.listForPerson(userId)).map((project) => ({
        id: project.id,
        name: project.name,
        repository: project.repoFullName,
        defaultBranch: project.defaultBranch,
      }));
    },

    async list(userId, { projectId, archived = false }) {
      const found = await threadsService.listForPerson(userId, BOT_THREADS_LISTED, {
        archived,
        projectId,
      });
      const repository = await repositories(userId);
      return found.map((thread) => viewOf(userId, thread, repository.get(thread.projectId) ?? ""));
    },

    async get(userId, id) {
      const thread = await threadsService.readableForPerson(userId, id);
      const history = await runs.history(thread);
      const { turns, earlier } = threadTurns(history);
      const asking = thread.awaitingAnswer ? pendingQuestion(history)?.questions : undefined;
      return {
        ...(await view(userId, thread)),
        turns,
        earlier,
        question: asking
          ?.map((question) => question.text)
          .join("\n")
          .slice(0, QUESTION_MAX),
      };
    },

    async start(actor, { projectId, prompt, title, ...selection }) {
      const { userId } = actor;
      const project = (await projectsService.listForPerson(userId)).find(
        (found) => found.id === projectId,
      );
      if (!project) throw new UnprocessableError(NO_PROJECT);
      const thread = await threadsService.create(project.organizationId, userId, {
        projectId,
        title: title ?? threadTitleFrom(prompt),
      });
      try {
        await messages.send(project.organizationId, userId, thread.id, { prompt, ...selection });
      } catch (error) {
        await threadsService
          .update({ organizationId: project.organizationId, userId }, thread.id, {
            state: "archived",
          })
          .catch(() => undefined);
        throw error;
      }
      await watchRun(actor, thread.id);
      return viewOf(userId, thread, project.repoFullName);
    },

    async continue(actor, id, { prompt, ...selection }) {
      const thread = await owned(actor, id);
      if (thread.awaitingAnswer) {
        throw new UnprocessableError(
          "The agent in this thread asked the person a question and waits for the answer. Tell the person to answer it in the thread: a message from you cannot.",
        );
      }
      const choice = actor.via === "person" ? selection : {};
      await followingUp(actor, id, () =>
        messages.send(
          thread.organizationId,
          actor.userId,
          id,
          { prompt, ...choice },
          { onPersonsWord: actor.via === "person" },
        ),
      );
      await watchRun(actor, id);
      return view(actor.userId, thread);
    },

    async archive(actor, id, archived) {
      const thread = await threadsService.ownedForPerson(actor.userId, id);
      const changed = await threadsService.update(
        { organizationId: thread.organizationId, userId: actor.userId },
        id,
        { state: archived ? "archived" : "open" },
      );
      if (!changed) throw new UnprocessableError("This thread no longer exists");
      if (archived) {
        await watch.settle(id, actor.botId);
        putAway({ id: changed.id, runtimeId: changed.runtimeId });
      }
      return view(actor.userId, changed);
    },

    async stop(actor, id) {
      const thread = await owned(actor, id);
      if (!runs.isRunning(id)) {
        throw new UnprocessableError(
          "No run is going on in this thread. Look at it with get_thread.",
        );
      }
      await followingUp(actor, id, async () => {
        await watch.settle(id, actor.botId);
        runs.cancel(id);
      });
      return { ...(await view(actor.userId, thread)), running: false };
    },
  };
}
