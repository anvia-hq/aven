import { pendingQuestion } from "@aven/protocol/events";
import {
  BOT_THREADS_LISTED,
  threadTitleFrom,
  threadTurns,
  type BotProjectView,
  type BotThreadDetail,
  type BotThreadView,
} from "@aven/protocol/threads";

import { UnprocessableError } from "../../errors";
import { projectsService } from "../projects/service";
import type { RunManager } from "../runs/service";
import type { Watcher } from "../thread-watch/service";
import type { ThreadMessages } from "./messages";
import { threadsService } from "./service";

/** The model a message may choose, as a person's composer does; without one their default runs. */
export type ThreadModelChoice = { providerId?: string; modelId?: string; reasoningEffort?: string };

/** What a bot's reply does with the person's threads (decision 0088). */
export type BotThreads = {
  projects(userId: string): Promise<BotProjectView[]>;
  list(
    userId: string,
    filter: { projectId?: string; archived?: boolean },
  ): Promise<BotThreadView[]>;
  get(userId: string, id: string): Promise<BotThreadDetail>;
  /**
   * Makes a thread in the project and sends it the prompt, which starts the agent; returns at once.
   * The bot is told when the run ends (decision 0101).
   */
  start(
    userId: string,
    botId: string,
    input: { projectId: string; prompt: string; title?: string } & ThreadModelChoice,
  ): Promise<BotThreadView>;
  /**
   * Sends a message to one of the person's own threads, as they would: it steers a run that is going
   * (decision 0098) or starts one. The bot is told when the run ends. `personsWord` says whether
   * the person asked for it, or the bot follows a note up (decision 0101).
   */
  continue(
    userId: string,
    botId: string,
    id: string,
    input: { prompt: string } & ThreadModelChoice,
    personsWord: boolean,
  ): Promise<BotThreadView>;
  archive(userId: string, id: string, archived: boolean): Promise<BotThreadView>;
  /** Stops the run of one of the person's own threads, as their Stop button does; nothing is owed of it. */
  stop(userId: string, id: string): Promise<BotThreadView>;
  /** Counts a follow-up after a note, on a thread the bot sent a run to (decision 0101); throws when it may not. */
  followUp(botId: string, id: string): Promise<void>;
};

type ThreadRow = Awaited<ReturnType<typeof threadsService.readableForPerson>>;

const NO_PROJECT = "There is no project with that id. Use list_projects.";
const QUESTION_MAX = 1000;

// The threads of a person, which a bot acts on as the person and finds by id: the workspace comes
// from the thread or project, and it must be one the person belongs to. A bot reads what the person
// reads, and drives only what the person made: a thread shared with the workspace is read-only, as
// it is in the platform (decision 0084). Whether it may start, continue or archive anything is the
// replier's to say, as for providers and MCP servers.
export function createBotThreads({
  runs,
  messages,
  watch,
}: {
  runs: Pick<RunManager, "isRunning" | "history" | "cancel">;
  messages: Pick<ThreadMessages, "send">;
  /** Keeps which bot sent a thread its run, so it hears how the run ended (decision 0101). */
  watch: {
    watch(threadId: string, watcher: Watcher, personsWord?: boolean): Promise<void>;
    settle(threadId: string): Promise<void>;
    followUp(threadId: string, botId: string): Promise<"ok" | "unwatched" | "spent">;
  };
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
      // Asked for more than shown, since the filters apply after: a person has many threads, most of
      // them old.
      const found = await threadsService.listForPerson(userId, 500);
      const repository = await repositories(userId);
      return found
        .filter((thread) => (thread.state === "archived") === archived)
        .filter((thread) => projectId === undefined || thread.projectId === projectId)
        .slice(0, BOT_THREADS_LISTED)
        .map((thread) => viewOf(userId, thread, repository.get(thread.projectId) ?? ""));
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

    async start(userId, botId, { projectId, prompt, title, ...selection }) {
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
        // A thread that never ran, as when the model has no key or the runner is off, would only
        // sit in the person's list: put it away, and say why.
        await threadsService
          .update({ organizationId: project.organizationId, userId }, thread.id, {
            state: "archived",
          })
          .catch(() => undefined);
        throw error;
      }
      await watch.watch(thread.id, { botId, userId });
      return viewOf(userId, thread, project.repoFullName);
    },

    async continue(userId, botId, id, { prompt, ...selection }, personsWord) {
      const thread = await threadsService.ownedForPerson(userId, id);
      if (thread.awaitingAnswer) {
        throw new UnprocessableError(
          "The agent in this thread asked the person a question and waits for the answer. Tell the person to answer it in the thread: a message from you cannot.",
        );
      }
      // A run that is going takes it at its next step; otherwise it starts one (decision 0101).
      await messages.send(thread.organizationId, userId, id, { prompt, ...selection });
      await watch.watch(id, { botId, userId }, personsWord);
      return view(userId, thread);
    },

    async archive(userId, id, archived) {
      const thread = await threadsService.ownedForPerson(userId, id);
      const changed = await threadsService.update(
        { organizationId: thread.organizationId, userId },
        id,
        { state: archived ? "archived" : "open" },
      );
      if (!changed) throw new UnprocessableError("This thread no longer exists");
      // Put away by the bot, so it is not told of it again.
      if (archived) await watch.settle(id);
      return view(userId, changed);
    },

    async stop(userId, id) {
      const thread = await threadsService.ownedForPerson(userId, id);
      // Stopped by the bot, so it is not told of it; the cancel is heard after this.
      await watch.settle(id);
      if (!runs.cancel(id)) {
        throw new UnprocessableError(
          "No run is going on in this thread. Look at it with get_thread.",
        );
      }
      return { ...(await view(userId, thread)), running: false };
    },

    async followUp(botId, id) {
      const allowed = await watch.followUp(id, botId);
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
    },
  };
}
