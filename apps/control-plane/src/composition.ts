import { describeError } from "./errors";
import { memoryStore } from "./memory-store";
import { projectsService } from "./modules/projects/service";
import { RemoteRuntime } from "./modules/runs/remote-runtime";
import { RunManager } from "./modules/runs/service";
import { runGateway } from "./modules/runtimes/gateway";
import { DEFAULT_GRACE_MS, RuntimeHub } from "./modules/runtimes/hub";
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
