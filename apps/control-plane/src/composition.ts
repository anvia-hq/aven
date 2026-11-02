import { describeError } from "./errors";
import { botMemoryStore, memoryStore } from "./memory-store";
import { createGoalDriver } from "./modules/goals/driver";
import { goalsService } from "./modules/goals/service";
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
import { botMcp } from "./modules/mcp/bot-access";
import { mcpService } from "./modules/mcp/service";
import { botProviders } from "./modules/providers/bot-access";
import { skillsService } from "./modules/skills/service";
import { createBotThreads } from "./modules/threads/bot-access";
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
  (results) => mcpService.record(results),
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

// What a bot may do with the person's threads (decision 0088): the same runs and messages the
// platform's routes use, so a thread a bot starts is an ordinary one.
const botThreads = createBotThreads({ runs: runsService, messages: threadMessages });

export const shipService = createShipService(runtimeHub, { send: threadMessages.start });

// Every bot's computer is on one runner: the control plane's own, which every person has, or the one
// `AVEN_BOT_RUNNER` names for a deployment that has turned its own off (decision 0059).
export const botRuntimeId = process.env.AVEN_BOT_RUNNER || LOCAL_RUNTIME_ID;

// A bot's message to another bot is answered through the chats, which are made from the runner,
// which is made from the replier: the replier reaches them when it is asked, not when it is made.
export const botRunner = new BotRunner({
  store: botMemoryStore,
  replier: new RemoteBotReplier(
    runtimeHub,
    runGateway,
    botMemoryStore,
    botRuntimeId,
    {
      list: (userId) => botsService.list(userId),
      create: (userId, bot) => botsService.create(userId, bot),
      update: (userId, id, changes) => botsService.update(userId, id, changes),
      deliver: (letter) => botChats.deliver(letter),
      greet: (userId, botId, hops) => botChats.greet(userId, botId, hops),
      timezone: (userId) => preferencesService.timezone(userId),
      goals: {
        get: (botId) => goalsService.get(botId),
        start: (userId, botId, input) => goalsService.start(userId, botId, input),
        update: (botId, action, reason) => goalsService.update(botId, action, reason),
      },
      schedules: {
        list: (userId) => schedulesService.list(userId),
        create: (userId, selfId, input) => schedulesService.create(userId, selfId, input),
        update: (userId, id, patch) => schedulesService.update(userId, id, patch),
        remove: (userId, id) => schedulesService.remove(userId, id),
      },
    },
    skillsService,
    botMcp,
    botProviders,
    botThreads,
  ),
  // A reply that ends with nothing behind it starts the next round of its bot's goal (decision 0068).
  settled: (reply) => goalDriver.settled(reply),
});

export const botChats = createBotChats(botRunner);

// Wakes a bot when one of its schedules is due (decision 0067), every half minute once started.
export const scheduler = createScheduler({
  fire: ({ userId, botId }, note) => botChats.fire(userId, botId, note),
  isBusy: (botId) => botRunner.busy(botId),
  intervalMs: 30_000,
});

// Keeps the goals of bots going: a round after a round as replies end, and a tick for a goal
// nothing is working on (decision 0068).
export const goalDriver = createGoalDriver({
  wake: (userId, botId, note) => botChats.fire(userId, botId, note),
  isIdle: (botId) => botRunner.isIdle(botId),
  intervalMs: 30_000,
});
