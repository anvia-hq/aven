import { runMemoryCommand } from "./modules/memory/commands";
import { memoryService } from "./modules/memory/service";
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
import { threadWatchService } from "./modules/thread-watch/service";
import { createThreadWatcher } from "./modules/thread-watch/watcher";
import { botMcp } from "./modules/mcp/bot-access";
import { mcpService } from "./modules/mcp/service";
import { botProviders } from "./modules/providers/bot-access";
import { skillsService } from "./modules/skills/service";
import { createBotThreads } from "./modules/threads/bot-access";
import { createDiffService } from "./modules/diff/service";
import { createThreadContinuation } from "./modules/threads/continuation";
import { createThreadForks } from "./modules/threads/forks";
import { createProcessEnds } from "./modules/threads/process-ends";
import { createThreadMessages } from "./modules/threads/messages";
import { syncPullRequest } from "./modules/threads/pull-request";
import { createPutAwayThread } from "./modules/threads/put-away";
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
  onRunFinished: async (thread, ending, run) => {
    const updated = (async () => {
      await threadsService.touch(thread.id);
      // The agent may have opened the thread's pull request (decision 0044); the badge learns of it here.
      await syncPullRequest(thread).catch((error: unknown) => {
        console.warn(
          `Could not look for the pull request of thread ${thread.id}:`,
          describeError(error),
        );
      });
    })();
    // A bot that sent the run is told how it ended, pull request and all, once the thread is
    // updated (decision 0101). `threadWatcher` is made below; this runs only when a run ends.
    await threadWatcher.ended(thread.id, run.startedAt, ending, updated);
    await updated;
    // A thread's agent that forked this one, and is still working, is told (decision 0135).
    await runtimeHub.forks.ended(thread, ending);
  },
  continuations: {
    save: (threadId, continuation) => threadsService.saveContinuation(threadId, continuation),
    clear: (threadId) => threadsService.clearContinuation(threadId),
  },
  failures: {
    record: (threadId, message) => threadsService.saveLastError(threadId, message),
    read: (threadId) => threadsService.lastError(threadId),
  },
});

export const threadMessages = createThreadMessages(runsService);

// A thread's agent can fork its thread (decision 0135): the hub answers the runner's calls for it.
runtimeHub.forks = createThreadForks({ runs: runsService, messages: threadMessages });

// A process the agent left running ends while it is idle: it is woken with a note (decision 0144).
runtimeHub.processEnds = createProcessEnds({ messages: threadMessages });

// A thread carried on to another runner reads the old one's changes through its runner (decision 0149).
const diffService = createDiffService(runtimeHub);
export const threadContinuation = createThreadContinuation({
  runs: runsService,
  hub: runtimeHub,
  messages: threadMessages,
  putAway: (thread) => putAwayThread(thread),
  patchOf: async (organizationId, threadId) => {
    const diff = await diffService.get(organizationId, threadId, "all");
    return diff.available ? { patch: diff.patch, truncated: diff.truncated } : null;
  },
});

// Archiving a thread stops its run and frees its sandbox (decision 0118), for the person's own
// routes and for a bot doing it on their word.
export const putAwayThread = createPutAwayThread({
  cancel: (threadId) => runsService.cancel(threadId),
  hub: runtimeHub,
});

// What a bot may do with the person's threads (decision 0088): the same runs and messages the
// platform's routes use, so a thread a bot starts is an ordinary one.
const botThreads = createBotThreads({
  runs: runsService,
  messages: threadMessages,
  watch: threadWatchService,
  putAway: putAwayThread,
});

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
    {
      folders: (owner) => memoryService.folders(owner),
      run: (caller, command) => runMemoryCommand(caller, command),
    },
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

// Tells a bot how the run it sent a thread ended, at the run's end or, for one whose end was missed,
// on a minute's tick (decision 0101).
export const threadWatcher = createThreadWatcher({
  get: (userId, threadId) => botThreads.get(userId, threadId),
  lastError: (threadId) => threadsService.lastError(threadId),
  activity: (threadId) => runsService.activity(threadId),
  wake: (userId, botId, note, threadId) => botChats.fire(userId, botId, note, threadId),
  intervalMs: 60_000,
});
