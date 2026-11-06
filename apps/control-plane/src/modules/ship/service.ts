import type { FileContent } from "@aven/protocol/runtime-wire";
import { wrapShipRequest } from "@aven/protocol/ship-request";
import { threadBranch } from "@aven/protocol/thread-branch";

import { ConflictError } from "../../errors";
import { createFilesService } from "../files/service";
import { githubService } from "../github/service";
import { githubUserTokenService } from "../github/user-tokens";
import type { ModelSelection } from "../providers/resolve-model";
import { projectsService } from "../projects/service";
import type { RuntimeHub } from "../runtimes/hub";
import { threadsService, type ThreadPullRequest } from "../threads/service";
import { SETUP_FILE, SHIP_PROMPT_FILE, shipPrompt, type ShipMode } from "./prompt";

export class GithubNotConnectedError extends ConflictError {
  constructor() {
    super("Connect your GitHub account to ship");
  }
}

type ShipDeps = {
  github: Pick<typeof githubService, "requireWritable" | "requirePush" | "appKeyOf">;
  userTokens: Pick<typeof githubUserTokenService, "use">;
  /** The thread and its project, for a thread of the organization. */
  load: (
    organizationId: string,
    threadId: string,
  ) => Promise<{
    githubInstallationId: string;
    repoFullName: string;
    defaultBranch: string;
    /** The thread's pull requests, newest first. */
    pullRequests: ThreadPullRequest[];
  }>;
  /** What the runner has for `.aven/ship.md`; null when the thread has no workspace yet. */
  readShipFile: (organizationId: string, threadId: string) => Promise<FileContent | null>;
  /** Whether the thread's workspace has this file; false when it has no workspace yet. */
  hasFile: (organizationId: string, threadId: string, path: string) => Promise<boolean>;
  /** Sends the agent a message, as a person would. */
  send: (
    organizationId: string,
    userId: string,
    threadId: string,
    body: { prompt: string } & ModelSelection,
  ) => Promise<void>;
};

/** What a Ship does, from what the person asked for and the thread's pull requests (decision 0069). */
export function shipMode(
  requested: "update" | "new" | undefined,
  pullRequests: Pick<ThreadPullRequest, "state">[],
): ShipMode {
  const [latest] = pullRequests;
  // The first pull request is the thread's own branch, whatever was asked.
  if (!latest) return "first";
  return requested ?? (latest.state === "open" ? "update" : "new");
}

// Ships a thread by sending its agent a prompt (decision 0044): the repository's `.aven/ship.md`,
// or a default. The agent commits, rebases, checks, pushes and opens the pull request with `gh`,
// signed in as the person, in the thread where they can watch it. Before that, Aven makes sure
// the person can do it at all: GitHub connected, the app approved to write, and write access to
// the repository, each a 409 that says what to do.
export function createShipService(
  hub: RuntimeHub,
  deps: Partial<ShipDeps> & Pick<ShipDeps, "send">,
) {
  const files = createFilesService(hub);
  const github = deps.github ?? githubService;
  const userTokens = deps.userTokens ?? githubUserTokenService;
  const load =
    deps.load ??
    (async (organizationId: string, threadId: string) => {
      const thread = await threadsService.require(organizationId, threadId);
      const project = await projectsService.get(organizationId, thread.projectId);
      // The row is there (its foreign key), unless the project was deleted (decision 0094).
      if (!project) throw new ConflictError("This thread's project was deleted");
      return { ...project, pullRequests: thread.pullRequests };
    });
  const readShipFile =
    deps.readShipFile ??
    (async (organizationId: string, threadId: string) => {
      const file = await files.read(organizationId, threadId, SHIP_PROMPT_FILE);
      return file.available ? file : null;
    });
  const hasFile =
    deps.hasFile ??
    (async (organizationId: string, threadId: string, path: string) => {
      const file = await files.read(organizationId, threadId, path);
      return file.available && file.kind !== "missing";
    });
  const { send } = deps;

  return {
    // Whether the repository is set up to ship (decision 0083): `/setup-env` has written its
    // environment script and `/setup-ship` how it ships. Read from the thread's own workspace, so
    // the thread that wrote them can ship them before they are merged.
    async readiness(organizationId: string, threadId: string) {
      const project = await load(organizationId, threadId);
      const [setup, ship, appKey] = await Promise.all([
        hasFile(organizationId, threadId, SETUP_FILE),
        hasFile(organizationId, threadId, SHIP_PROMPT_FILE),
        // The GitHub App the project is of, which the person's connection to ship must be for.
        github.appKeyOf(project.githubInstallationId),
      ]);
      return { ready: setup && ship, setup, ship, appKey };
    },

    // `selection` is the model the thread is on; without it the person's default provider runs, which
    // may be another provider than the thread's earlier runs used.
    async ship(
      organizationId: string,
      userId: string,
      threadId: string,
      { mode, ...selection }: ModelSelection & { mode?: "update" | "new" } = {},
    ) {
      const project = await load(organizationId, threadId);
      // The person's GitHub connection has to be for the app the project's installation is of.
      const connection = await userTokens.use(
        userId,
        await github.appKeyOf(project.githubInstallationId),
      );
      if (!connection) throw new GithubNotConnectedError();
      await github.requireWritable(project.githubInstallationId);
      await github.requirePush(
        project.githubInstallationId,
        connection.token,
        project.repoFullName,
      );

      const prompt = shipPrompt(await readShipFile(organizationId, threadId), {
        branch: threadBranch(threadId),
        base: project.defaultBranch,
        mode: shipMode(mode, project.pullRequests),
        pullRequests: project.pullRequests,
      });
      // Wrapped, so the thread can show it as a card and not as a long message.
      await send(organizationId, userId, threadId, {
        prompt: wrapShipRequest(prompt),
        ...selection,
      });
    },
  };
}
