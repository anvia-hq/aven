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
import { createActionsService } from "./modules/actions/service";
import { createEnvironmentService } from "./modules/environment/service";
import { runnerFor } from "./modules/runtimes/ask-runner";
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
      await syncPullRequest(thread).catch((error: unknown) => {
        console.warn(
          `Could not look for the pull request of thread ${thread.id}:`,
          describeError(error),
        );
      });
    })();
    await threadWatcher.ended(thread.id, run.startedAt, ending, updated);
    await updated;
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
  workedTimes: {
    record: (threadId, index, ms) => threadsService.saveWorkedTime(threadId, index, ms),
    read: (threadId) => threadsService.workedTimes(threadId),
  },
  senders: {
    record: (threadId, index, senderId) => threadsService.saveSender(threadId, index, senderId),
    read: (threadId) => threadsService.senders(threadId),
  },
});

export const threadMessages = createThreadMessages(runsService);

runtimeHub.forks = createThreadForks({ runs: runsService, messages: threadMessages });

runtimeHub.processEnds = createProcessEnds({ messages: threadMessages });

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

export const putAwayThread = createPutAwayThread({
  cancel: (threadId) => runsService.cancel(threadId),
  hub: runtimeHub,
});

const botThreads = createBotThreads({
  runs: runsService,
  messages: threadMessages,
  watch: threadWatchService,
  putAway: putAwayThread,
});

export const environmentService = createEnvironmentService(runnerFor(runtimeHub), {
  repoAccess: (threadId) => projectsService.repoAccess(threadId),
});
export const actionsService = createActionsService(runtimeHub, { send: threadMessages.start });
export const shipService = createShipService(runtimeHub, { send: threadMessages.start });

export const botRuntimeId = process.env.AVEN_BOT_RUNNER || LOCAL_RUNTIME_ID;

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
  settled: (reply) => goalDriver.settled(reply),
});

export const botChats = createBotChats(botRunner);

export const scheduler = createScheduler({
  fire: ({ userId, botId }, note) => botChats.fire(userId, botId, note),
  isBusy: (botId) => botRunner.busy(botId),
  intervalMs: 30_000,
});

export const goalDriver = createGoalDriver({
  wake: (userId, botId, note) => botChats.fire(userId, botId, note),
  isIdle: (botId) => botRunner.isIdle(botId),
  intervalMs: 30_000,
});

export const threadWatcher = createThreadWatcher({
  get: (userId, threadId) => botThreads.get(userId, threadId),
  lastError: (threadId) => threadsService.lastError(threadId),
  activity: (threadId) => runsService.activity(threadId),
  wake: (userId, botId, note, threadId) => botChats.fire(userId, botId, note, threadId),
  intervalMs: 60_000,
});
