import { describeError } from "./errors";
import { botMemoryStore, memoryStore } from "./memory-store";
import { createBotChats } from "./modules/bots/chats";
import { RemoteBotReplier } from "./modules/bots/remote-replier";
import { BotRunner } from "./modules/bots/runner";
import { botsService } from "./modules/bots/service";
import { preferencesService } from "./modules/preferences/service";
import { createScheduler } from "./modules/schedules/scheduler";
import { schedulesService } from "./modules/schedules/service";
import { projectsService } from "./modules/projects/service";
import { RemoteRuntime } from "./modules/runs/remote-runtime";
import { RunManager } from "./modules/runs/service";
import { runGateway } from "./modules/runtimes/gateway";
import { DEFAULT_GRACE_MS, RuntimeHub } from "./modules/runtimes/hub";
import { LOCAL_RUNTIME_ID } from "./modules/runtimes/service";
import { createShipService } from "./modules/ship/service";
import { skillsService } from "./modules/skills/service";
import { createThreadMessages } from "./modules/threads/messages";
import { syncPullRequest } from "./modules/threads/pull-request";
import { threadsService } from "./modules/threads/service";

// The app's long-lived objects, made once here and handed to the routers that need them, so the
// modules they join (runtimes and projects, runs and threads) do not import each other.

export const runtimeHub = new RuntimeHub(
  memoryStore,
  (threadId) => projectsService.repoAccess(threadId),
  DEFAULT_GRACE_MS,
  (digest) => skillsService.archive(digest),
);

export const runsService = new RunManager({
  store: memoryStore,
  runtime: new RemoteRuntime(runtimeHub, runGateway),
  onRunFinished: async (thread) => {
    await threadsService.touch(thread.id);
    // The agent may have opened the thread's pull request (decision 0044); the badge learns of it here.
    await syncPullRequest(thread).catch((error: unknown) => {
      console.warn(
        `Could not look for the pull request of thread ${thread.id}:`,
        describeError(error),
      );
    });
  },
  continuations: {
    save: (threadId, continuation) => threadsService.saveContinuation(threadId, continuation),
    clear: (threadId) => threadsService.clearContinuation(threadId),
  },
});

export const threadMessages = createThreadMessages(runsService);

export const shipService = createShipService(runtimeHub, { send: threadMessages.send });

// Every bot's computer is on one runner: the control plane's own, which every person has, or the one
// `AVEN_BOT_RUNNER` names for a deployment that has turned its own off (decision 0059).
export const botRuntimeId = process.env.AVEN_BOT_RUNNER || LOCAL_RUNTIME_ID;

// A bot's message to another bot is answered through the chats, which are made from the runner,
// which is made from the replier: the replier reaches them when it is asked, not when it is made.
export const botRunner = new BotRunner({
  store: botMemoryStore,
  replier: new RemoteBotReplier(runtimeHub, runGateway, botMemoryStore, botRuntimeId, {
    list: (userId) => botsService.list(userId),
    create: (userId, bot) => botsService.create(userId, bot),
    update: (userId, id, changes) => botsService.update(userId, id, changes),
    deliver: (userId, from, hops, handle, text) =>
      botChats.deliver(userId, from, hops, handle, text),
    greet: (userId, botId, hops) => botChats.greet(userId, botId, hops),
    timezone: (userId) => preferencesService.timezone(userId),
    schedules: {
      list: (userId) => schedulesService.list(userId),
      create: (userId, selfId, input) => schedulesService.create(userId, selfId, input),
      update: (userId, id, patch) => schedulesService.update(userId, id, patch),
      remove: (userId, id) => schedulesService.remove(userId, id),
    },
  }),
});

export const botChats = createBotChats(botRunner);

// Wakes a bot when one of its schedules is due (decision 0067), every half minute once started.
export const scheduler = createScheduler({
  fire: ({ userId, botId }, note) => botChats.fire(userId, botId, note),
  isBusy: (botId) => botRunner.busy(botId),
  intervalMs: 30_000,
});
