import { threadBranch } from "@aven/protocol/thread-branch";

import { ConflictError, describeError, UnavailableError } from "../../errors";
import { githubService } from "../github/service";
import { projectsService } from "../projects/service";
import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { runsService } from "../runs/service";
import { threadsService } from "../threads/service";
import { pushResult } from "./schema";

export class RunInProgressError extends ConflictError {
  constructor() {
    super("The agent is still working on this thread");
  }
}
export class NoWorkspaceError extends ConflictError {
  constructor() {
    super("The thread has no workspace yet; ask the agent to work on it first");
  }
}
export class NothingToShipError extends ConflictError {
  constructor() {
    super("There is nothing to ship yet");
  }
}

// Committing and pushing take longer than the usual few seconds a call gets.
const PUSH_TIMEOUT_MS = 2 * 60_000;

// The runtime's own reason stays in the log; the client gets a fixed message.
const refused = (error: unknown): never => {
  console.warn("The push was refused:", describeError(error));
  throw new UnavailableError("The changes could not be pushed");
};

/** Who the commit is by. */
export type Author = { name: string; email: string };

// Ships a thread as a pull request (decision 0040): the runner commits and pushes the thread's
// branch with a token made for the push, and the control plane opens the pull request. The agent
// has no part in it, and no GitHub credential reaches a sandbox.
export function createShipService(
  hub: RuntimeHub,
  github: Pick<typeof githubService, "pushToken" | "openPullRequest"> = githubService,
  runs: Pick<typeof runsService, "isRunning"> = runsService,
) {
  const runner = runnerFor(hub);
  return {
    async ship(organizationId: string, author: Author, threadId: string) {
      const thread = await threadsService.require(organizationId, threadId);
      if (runs.isRunning(thread.id)) throw new RunInProgressError();
      const project = await projectsService.get(organizationId, thread.projectId);
      // A thread's project row is guaranteed by its foreign key.
      if (!project) throw new Error("The thread's project is missing");

      const branch = threadBranch(thread.id);
      const pushed = await runner.ask(
        organizationId,
        "repo.push",
        {
          threadId: thread.id,
          cloneUrl: project.cloneUrl,
          branch,
          token: await github.pushToken(project.githubInstallationId, project.repoFullName),
          commitMessage: thread.title,
          author,
        },
        pushResult,
        refused,
        PUSH_TIMEOUT_MS,
      );
      if (!pushed) throw new NoWorkspaceError();
      if (pushed.kind === "nothing") throw new NothingToShipError();

      const pullRequest = await github.openPullRequest(project.githubInstallationId, {
        fullName: project.repoFullName,
        head: branch,
        base: project.defaultBranch,
        title: thread.title,
        body: "Opened from an Aven thread.",
        draft: true,
      });
      await threadsService.setPullRequest(thread.id, pullRequest);
      return pullRequest;
    },
  };
}
