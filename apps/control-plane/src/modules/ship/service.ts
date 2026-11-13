import { wrapShipRequest } from "@aven/protocol/ship-request";
import { threadBranch } from "@aven/protocol/thread-branch";

import { ConflictError } from "@aven/server-kit/errors";
import { createFilesService } from "../files/service";
import { PLATFORM_APP } from "../github/clients";
import { githubService } from "../github/service";
import { githubUserTokenService } from "../github/user-tokens";
import { projectsService } from "../projects/service";
import { runtimesService } from "../runtimes/service";
import type { RuntimeHub } from "../runtimes/hub";
import { threadsService } from "../threads/service";
import { SHIP_PROMPT_FILE, shipPrompt } from "./prompt";
import type { ModelSelection } from "../providers/types";
import type { ShipMode } from "./types";
import type { ThreadPullRequest } from "../threads/types";
import type { FileContent, RuntimeGithubMode } from "@aven/protocol/types";

export class GithubNotConnectedError extends ConflictError {
  constructor() {
    super("Connect your GitHub account to ship");
  }
}

type ShipDeps = {
  github: Pick<typeof githubService, "requireWritable" | "requirePush" | "appKeyOf">;
  userTokens: Pick<typeof githubUserTokenService, "use">;
  load: (
    organizationId: string,
    threadId: string,
  ) => Promise<{
    githubInstallationId: string | null;
    repoFullName: string | null;
    directory: string | null;
    defaultBranch: string | null;
    pullRequests: ThreadPullRequest[];
    githubMode: RuntimeGithubMode;
    runtimeId: string;
  }>;
  readShipFile: (organizationId: string, threadId: string) => Promise<FileContent | null>;
  hasFile: (organizationId: string, threadId: string, path: string) => Promise<boolean>;
  send: (
    organizationId: string,
    userId: string,
    threadId: string,
    body: { prompt: string } & ModelSelection,
  ) => Promise<void>;
};

export function shipMode(
  requested: "update" | "new" | undefined,
  pullRequests: Pick<ThreadPullRequest, "state">[],
): ShipMode {
  const [latest] = pullRequests;

  if (!latest) return "first";

  return requested ?? (latest.state === "open" ? "update" : "new");
}

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

      if (!project) throw new ConflictError("This thread's project was deleted");

      return {
        ...project,
        pullRequests: thread.pullRequests,
        githubMode: await runtimesService.githubModeOf(thread.runtimeId),
        runtimeId: thread.runtimeId,
      };
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
    async readiness(organizationId: string, threadId: string) {
      const project = await load(organizationId, threadId);
      const [ship, appKey] = await Promise.all([
        hasFile(organizationId, threadId, SHIP_PROMPT_FILE),
        project.githubInstallationId ? github.appKeyOf(project.githubInstallationId) : null,
      ]);
      const person = project.githubMode === "person";
      return {
        ready: ship,
        ship,
        appKey: appKey ?? (person ? PLATFORM_APP : null),
        machine: project.githubInstallationId === null && !person,
        githubMode: project.githubMode,
        runnerGithub: hub.get(project.runtimeId)?.github ?? null,
      };
    },

    async ship(
      organizationId: string,
      userId: string,
      threadId: string,
      { mode, ...selection }: ModelSelection & { mode?: "update" | "new" } = {},
    ) {
      const project = await load(organizationId, threadId);

      if (!project.githubInstallationId && project.githubMode === "person") {
        const connection = await userTokens.use(userId, PLATFORM_APP);

        if (!connection) throw new GithubNotConnectedError();
      }

      if (project.githubInstallationId && project.repoFullName) {
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
      }

      const prompt = shipPrompt(await readShipFile(organizationId, threadId), {
        branch: threadBranch(threadId),
        base: project.defaultBranch ?? "the repository's default branch",
        mode: shipMode(mode, project.pullRequests),
        pullRequests: project.pullRequests,
        folder: project.directory,
      });
      await send(organizationId, userId, threadId, {
        prompt: wrapShipRequest(prompt),
        ...selection,
      });
    },
  };
}
