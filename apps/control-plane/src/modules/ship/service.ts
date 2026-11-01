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
import { SHIP_PROMPT_FILE, shipPrompt, type ShipMode } from "./prompt";

export class GithubNotConnectedError extends ConflictError {
  constructor() {
    super("Connect your GitHub account to ship");
  }
}

type ShipDeps = {
  github: Pick<typeof githubService, "requireWritable" | "requirePush">;
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
      // A thread's project row is guaranteed by its foreign key.
      if (!project) throw new Error("The thread's project is missing");
      return { ...project, pullRequests: thread.pullRequests };
    });
  const readShipFile =
    deps.readShipFile ??
    (async (organizationId: string, threadId: string) => {
      const file = await files.read(organizationId, threadId, SHIP_PROMPT_FILE);
      return file.available ? file : null;
    });
  const { send } = deps;

  return {
    // `selection` is the model the thread is on; without it the person's default provider runs, which
    // may be another provider than the thread's earlier runs used.
    async ship(
      organizationId: string,
      userId: string,
      threadId: string,
      { mode, ...selection }: ModelSelection & { mode?: "update" | "new" } = {},
    ) {
      const project = await load(organizationId, threadId);
      const connection = await userTokens.use(userId);
      if (!connection) throw new GithubNotConnectedError();
      await github.requireWritable(project.githubInstallationId);
      await github.requirePush(connection.token, project.repoFullName);

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
