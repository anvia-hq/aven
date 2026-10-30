import { threadBranch } from "@aven/protocol/thread-branch";

import { ConflictError, describeError, UnavailableError } from "../../errors";
import { githubService } from "../github/service";
import { githubUserTokenService, type GithubIdentity } from "../github/user-tokens";
import { projectsService } from "../projects/service";
import { runnerFor } from "../runtimes/ask-runner";
import type { RuntimeHub } from "../runtimes/hub";
import { runsService } from "../runs/service";
import { threadsService } from "../threads/service";
import { createRunnerDrafter, type Drafter } from "./draft";
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
export class GithubNotConnectedError extends ConflictError {
  constructor() {
    super("Connect your GitHub account to ship");
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

// What a commit by the person is signed with: their GitHub name and the address GitHub links to
// their account whatever email their Aven account has.
const authorOf = ({ id, login, name }: GithubIdentity) => ({
  name: name ?? login,
  email: `${id}+${login}@users.noreply.github.com`,
});

type ShipDeps = {
  github: Pick<typeof githubService, "requireWritable" | "requirePush" | "openPullRequest">;
  userTokens: Pick<typeof githubUserTokenService, "use">;
  runs: Pick<typeof runsService, "isRunning">;
  draft: Drafter;
};

// Ships a thread as a pull request, as the person (decisions 0040 and 0041): the runner commits and
// pushes the thread's branch with the person's GitHub token, handed over for that one call, and the
// control plane opens the pull request with it. The agent has no part in it, and no GitHub
// credential reaches a sandbox.
export function createShipService(hub: RuntimeHub, deps: Partial<ShipDeps> = {}) {
  const github = deps.github ?? githubService;
  const userTokens = deps.userTokens ?? githubUserTokenService;
  const runs = deps.runs ?? runsService;
  const draft = deps.draft ?? createRunnerDrafter(hub);
  const runner = runnerFor(hub);
  return {
    async ship(organizationId: string, userId: string, threadId: string) {
      const thread = await threadsService.require(organizationId, threadId);
      if (runs.isRunning(thread.id)) throw new RunInProgressError();
      const connection = await userTokens.use(userId);
      if (!connection) throw new GithubNotConnectedError();
      const project = await projectsService.get(organizationId, thread.projectId);
      // A thread's project row is guaranteed by its foreign key.
      if (!project) throw new Error("The thread's project is missing");
      await github.requireWritable(project.githubInstallationId);
      await github.requirePush(connection.token, project.repoFullName);

      const branch = threadBranch(thread.id);
      const text = await draft(organizationId, userId, thread);
      const pushed = await runner.ask(
        organizationId,
        "repo.push",
        {
          threadId: thread.id,
          cloneUrl: project.cloneUrl,
          branch,
          token: connection.token,
          commitMessage: text.title,
          author: authorOf(connection.identity),
        },
        pushResult,
        refused,
        PUSH_TIMEOUT_MS,
      );
      if (!pushed) throw new NoWorkspaceError();
      if (pushed.kind === "nothing") throw new NothingToShipError();

      const pullRequest = await github.openPullRequest(connection.token, {
        fullName: project.repoFullName,
        head: branch,
        base: project.defaultBranch,
        title: text.title,
        body: text.body,
        draft: true,
      });
      await threadsService.setPullRequest(thread.id, pullRequest);
      return pullRequest;
    },
  };
}
