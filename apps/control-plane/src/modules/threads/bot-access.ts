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
import type { WatchedRun, Watcher } from "../thread-watch/service";
import type { ThreadMessages } from "./messages";
import { threadsService } from "./service";

/** The model a message may choose, as a person's composer does; without one their default runs. */
export type ThreadModelChoice = { providerId?: string; modelId?: string; reasoningEffort?: string };

/**
 * Who acts on a thread: the bot and its person, and on whose word. `person` is the person's own
 * message; `note` is the app's word on the one thread the note is about, which may only continue or
 * stop that thread, a few times, with no model of its own choosing (decision 0101).
 */
export type BotActor = { userId: string; botId: string; via: "person" | "note" };

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
    actor: BotActor,
    input: { projectId: string; prompt: string; title?: string } & ThreadModelChoice,
  ): Promise<BotThreadView>;
  /**
   * Sends a message to one of the person's own threads, as they would: it steers a run that is going
   * (decision 0098) or starts one. The bot is told when the run ends.
   */
  continue(
    actor: BotActor,
    id: string,
    input: { prompt: string } & ThreadModelChoice,
  ): Promise<BotThreadView>;
  archive(actor: BotActor, id: string, archived: boolean): Promise<BotThreadView>;
  /** Stops the run of one of the person's own threads, as their Stop button does; the bot is owed no note of it. */
  stop(actor: BotActor, id: string): Promise<BotThreadView>;
};

type ThreadRow = Awaited<ReturnType<typeof threadsService.readableForPerson>>;

const lastActivityAt = (activity?: { lastEventAt: number }) =>
  activity && new Date(activity.lastEventAt).toISOString();

const NO_PROJECT = "There is no project with that id. Use list_projects.";
const QUESTION_MAX = 1000;

// The threads of a person, which a bot acts on as the person and finds by id: the workspace comes
// from the thread or project, and it must be one the person belongs to. A bot reads what the person
// reads, and drives only what the person made: a thread shared with the workspace is read-only, as
// it is in the platform (decision 0084). Whose word an action is on is the replier's to say, as for
// providers and MCP servers; what a note's follow-up may do is held here (decision 0101).
export function createBotThreads({
  runs,
  messages,
  watch,
}: {
  runs: Pick<RunManager, "isRunning" | "history" | "cancel" | "activity">;
  messages: Pick<ThreadMessages, "send">;
  /** Keeps which bot sent a thread its run, so it hears how the run ended (decision 0101). */
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

  // The bot is owed a note for the run its message started or steered: the one going now, or none
  // when it was so quick it has ended already (the tick tells of that one). A watch that cannot be
  // kept costs only the note: the work was sent, so it is not reported as failed.
  const watchRun = async (actor: BotActor, id: string) => {
    const run = runs.activity(id)?.startedAt ?? null;
    await watch
      .watch(id, actor, { run, personsWord: actor.via === "person" })
      .catch((error: unknown) => console.warn(`Could not watch thread ${id} for its bot:`, error));
  };

  // A note's follow-up is counted once its checks have passed, and given back when it is not made.
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

  // One of the person's own threads; a note does not bring back one they put away.
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
        // A thread that never ran, as when the model has no key or the runner is off, would only
        // sit in the person's list: put it away, and say why.
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
      // A note's follow-up runs on the person's default model: what a thread wrote cannot pick one.
      const choice = actor.via === "person" ? selection : {};
      // A run that is going takes it at its next step; otherwise it starts one (decision 0101).
      await followingUp(actor, id, () =>
        // A run it starts keeps no notes: it was begun by a note, not the person (decision 0102).
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
      // Put away by the bot, so it is not told of it again; another bot's note is its own.
      if (archived) await watch.settle(id, actor.botId);
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
        // Stopped by the bot, so it is not told of it; a run that ended meanwhile is over all the same.
        await watch.settle(id, actor.botId);
        runs.cancel(id);
      });
      return { ...(await view(actor.userId, thread)), running: false };
    },
  };
}
