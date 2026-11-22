import { db } from "@aven/db/client";
import { githubInstallations } from "@aven/db/schema/github-installations";
import { github, GithubApiError } from "@aven/github/client";
import { isDriving } from "@aven/protocol/drivers";
import type {
  GitActionResult,
  GitBranchInfo,
  GitCommitDiffResult,
  GitCommitEntry,
  GitReflogResult,
  GitSnapshotResult,
  GitWipSummary,
  GitWorkspaceStatusResult,
  GitWorkspaceTarget,
} from "@aven/protocol/types";
import {
  ConflictError,
  describeError,
  ForbiddenError,
  NotFoundError,
  UnavailableError,
  UnprocessableError,
} from "@aven/server-kit/errors";
import { and, eq } from "drizzle-orm";

import { githubUserTokenService } from "../github/user-tokens";
import { projectsService } from "../projects/service";
import type { RuntimeHub } from "../runtimes/hub";
import { runtimesService } from "../runtimes/service";
import type { RunManager } from "../runs/service";
import { threadsService } from "../threads/service";
import type { createThreadMessages } from "../threads/messages";
import type { Viewer } from "../threads/types";
import type {
  CreatePullBody,
  GitActionBody,
  HandoffBody,
  MergePullBody,
  ReflogQuery,
  ReviewPullBody,
  SnapshotQuery,
  UpdatePullStateBody,
  WorkspaceQuery,
} from "./schema";
import type {
  GitCenterCheckLogResponse,
  GitCenterCommitDetail,
  GitCenterHandoffResult,
  GitCenterModeReason,
  GitCenterPullDetailResponse,
  GitCenterReflogResponse,
  GitCenterSnapshot,
  GitCenterThreadOverlay,
  GitCenterWorkspaceResponse,
} from "./types";

const SNAPSHOT_TIMEOUT_MS = 25_000;
const ACTION_TIMEOUT_MS = 100_000;
const UNKNOWN_CALL_RE = /unknown call/i;

function emptyWip(): GitWipSummary {
  return { staged: 0, unstaged: 0, untracked: 0, conflicted: 0, additions: 0, deletions: 0 };
}

function patchFromGithubFiles(
  files: { path: string; oldPath: string | null; status: string; patch: string | null }[],
) {
  return files
    .flatMap((file) => {
      if (!file.patch) return [];

      const from = file.oldPath ?? file.path;
      return [
        `diff --git a/${from} b/${file.path}`,
        `--- a/${from}`,
        `+++ b/${file.path}`,
        file.patch,
      ];
    })
    .join("\n");
}

function mapGithubWriteError(error: unknown): never {
  if (error instanceof GithubApiError) {
    if (error.status === 403) {
      throw new ForbiddenError(
        "Reconnect your GitHub account in Settings > GitHub to grant write permissions for this action",
      );
    }

    if (error.status === 404)
      throw new NotFoundError("Pull request or repository not found on GitHub");

    if (error.status === 405 || error.status === 409 || error.status === 422) {
      throw new ConflictError(error.message);
    }
  }

  throw error;
}

export function createGitCenterService(
  hub: Pick<RuntimeHub, "get">,
  runs: Pick<RunManager, "isRunning">,
  messages: Pick<ReturnType<typeof createThreadMessages>, "send">,
) {
  const inFlightSnapshots = new Map<
    string,
    { token: symbol; promise: Promise<GitCenterSnapshot> }
  >();

  async function requireProject(organizationId: string, projectId: string) {
    const project = await projectsService.get(organizationId, projectId);

    if (!project) throw new NotFoundError("Project not found");

    return project;
  }

  async function installationOf(
    organizationId: string,
    project: { githubInstallationId: string | null; repoFullName: string | null },
  ) {
    if (!project.githubInstallationId || !project.repoFullName || !github.configured) return null;

    const [row] = await db
      .select({ installationId: githubInstallations.installationId })
      .from(githubInstallations)
      .where(
        and(
          eq(githubInstallations.id, project.githubInstallationId),
          eq(githubInstallations.organizationId, organizationId),
        ),
      );

    if (!row) return null;

    return { installationId: row.installationId, repo: project.repoFullName };
  }

  async function requireGithubRepo(
    organizationId: string,
    project: { githubInstallationId: string | null; repoFullName: string | null },
  ) {
    const found = await installationOf(organizationId, project);

    if (!found) {
      throw new UnprocessableError("This project is not connected to a GitHub repository");
    }

    return found;
  }

  async function requireUserGithubToken(userId: string) {
    const grant = await githubUserTokenService.use(userId);

    if (!grant) {
      throw new UnprocessableError(
        "Connect your GitHub account in Settings > GitHub to perform PR actions",
      );
    }

    return grant;
  }

  async function canUseProjectRuntime(
    organizationId: string,
    userId: string,
    runtimeId: string | null,
  ) {
    if (!runtimeId) return null;

    const runtime = await runtimesService.get(organizationId, runtimeId, userId);

    if (!runtime) return null;

    return hub.get(runtimeId) ?? null;
  }

  async function buildSnapshot(
    viewer: Viewer,
    projectId: string,
    query: SnapshotQuery,
  ): Promise<GitCenterSnapshot> {
    const project = await requireProject(viewer.organizationId, projectId);
    const [allThreads, ghRepo, userToken] = await Promise.all([
      threadsService.list(viewer),
      installationOf(viewer.organizationId, project),
      githubUserTokenService.use(viewer.userId).catch(() => null),
    ]);
    const projectThreads = allThreads
      .filter((t) => t.projectId === project.id && t.state !== "archived")
      .slice(0, 25);

    const pullsPromise = ghRepo
      ? github.listPulls(ghRepo.installationId, ghRepo.repo, "open").catch(() => [])
      : Promise.resolve([]);

    const runner = project.directory
      ? await canUseProjectRuntime(viewer.organizationId, viewer.userId, project.runtimeId)
      : null;

    let runnerSnapshot: GitSnapshotResult | null = null;
    let modeReason: GitCenterModeReason = "ok";

    if (runner && project.directory) {
      try {
        runnerSnapshot = (await runner.call(
          "git.snapshot",
          {
            folder: project.directory,
            page: query.page,
            limit: query.limit,
            branch: query.branch,
            search: query.search,
            author: query.author,
            path: query.path,
            threadIds: projectThreads.map((t) => t.id),
          },
          SNAPSHOT_TIMEOUT_MS,
        )) as GitSnapshotResult;

        if (!runnerSnapshot.isRepo) {
          modeReason = "not_a_repo";
          runnerSnapshot = null;
        }
      } catch (error) {
        const reason = describeError(error);
        modeReason = UNKNOWN_CALL_RE.test(reason) ? "runner_outdated" : "runner_offline";
        runnerSnapshot = null;
      }
    } else if (project.directory) {
      modeReason = "runner_offline";
    } else {
      modeReason = "github_only";
    }

    const pulls = await pullsPromise;

    if (runnerSnapshot) {
      const wsMap = new Map(runnerSnapshot.threadWorkspaces.map((ws) => [ws.threadId, ws]));
      const threads: GitCenterThreadOverlay[] = projectThreads.map((thread) => {
        const ws = wsMap.get(thread.id);
        const canMutate = thread.createdBy === viewer.userId || isDriving(thread.drivingUntil);
        return {
          id: thread.id,
          title: thread.title,
          branch: ws?.branch ?? null,
          headSha: ws?.headSha ?? null,
          running: runs.isRunning(thread.id),
          canMutate,
          wip: ws?.wip ?? emptyWip(),
          conflicts: ws?.conflicts ?? null,
          pullRequests: thread.pullRequests,
          updatedAt: thread.updatedAt.toISOString(),
        };
      });

      return {
        project: {
          id: project.id,
          name: project.name,
          repoFullName: project.repoFullName,
          directory: project.directory,
          runtimeId: project.runtimeId,
          defaultBranch: runnerSnapshot.defaultBranch ?? project.defaultBranch,
        },
        mode: "live",
        modeReason: "ok",
        githubConnected: userToken !== null,
        headBranch: runnerSnapshot.headBranch,
        headSha: runnerSnapshot.headSha,
        detached: runnerSnapshot.detached,
        defaultBranch: runnerSnapshot.defaultBranch ?? project.defaultBranch,
        branches: runnerSnapshot.branches,
        remotes: runnerSnapshot.remotes,
        tags: runnerSnapshot.tags,
        stashes: runnerSnapshot.stashes,
        worktrees: runnerSnapshot.worktrees,
        conflicts: runnerSnapshot.conflicts,
        wip: runnerSnapshot.wip,
        commits: runnerSnapshot.commits,
        hasMore: runnerSnapshot.hasMore,
        threads,
        pulls,
      };
    }

    const defaultBranch = project.defaultBranch ?? "main";
    let commits: GitCommitEntry[] = [];
    let hasMore = false;
    let branches: GitBranchInfo[] = [];

    if (ghRepo) {
      const [ghCommits, ghBranches] = await Promise.all([
        github
          .commits(ghRepo.installationId, ghRepo.repo, query.page ?? 1, defaultBranch, {
            branch: query.branch,
            author: query.author,
            path: query.path,
          })
          .catch(() => null),
        github.branches(ghRepo.installationId, ghRepo.repo, defaultBranch).catch(() => null),
      ]);

      if (ghCommits) {
        hasMore = ghCommits.hasMore;
        commits = ghCommits.commits.map((c) => ({
          sha: c.sha,
          shortSha: c.sha.slice(0, 7),
          message: c.message,
          body: "",
          author: c.author,
          authorEmail: null,
          date: c.date,
          parents: c.parents,
          refs: c.refs,
          remoteRefs: [],
          tags: c.tags,
        }));
      }

      branches = (ghBranches?.branches ?? []).map((b) => ({
        name: b.name,
        sha: b.lastCommit?.sha ?? "",
        current: b.isDefault,
        upstream: `origin/${b.name}`,
        ahead: b.ahead,
        behind: b.behind,
        gone: false,
        merged: false,
        lastCommitDate: b.lastCommit?.date ?? null,
      }));
    }

    const threads: GitCenterThreadOverlay[] = projectThreads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      branch: thread.pullRequests[0]?.branch ?? null,
      headSha: null,
      running: runs.isRunning(thread.id),
      canMutate: false,
      wip: emptyWip(),
      conflicts: null,
      pullRequests: thread.pullRequests,
      updatedAt: thread.updatedAt.toISOString(),
    }));

    return {
      project: {
        id: project.id,
        name: project.name,
        repoFullName: project.repoFullName,
        directory: project.directory,
        runtimeId: project.runtimeId,
        defaultBranch,
      },
      mode: "readonly",
      modeReason,
      githubConnected: userToken !== null,
      headBranch: defaultBranch,
      headSha: commits[0]?.sha ?? null,
      detached: false,
      defaultBranch,
      branches,
      remotes: [],
      tags: [],
      stashes: [],
      worktrees: [],
      conflicts: null,
      wip: emptyWip(),
      commits,
      hasMore,
      threads,
      pulls,
    };
  }

  return {
    snapshot(viewer: Viewer, projectId: string, query: SnapshotQuery): Promise<GitCenterSnapshot> {
      const key = `${viewer.organizationId}:${viewer.userId}:${projectId}:${query.page ?? 1}:${query.branch ?? ""}:${query.search ?? ""}:${query.author ?? ""}:${query.path ?? ""}`;
      const existing = inFlightSnapshots.get(key);

      if (existing) return existing.promise;

      const token = Symbol();
      const promise = buildSnapshot(viewer, projectId, query).finally(() => {
        if (inFlightSnapshots.get(key)?.token === token) inFlightSnapshots.delete(key);
      });
      inFlightSnapshots.set(key, { token, promise });
      return promise;
    },

    async commitDiff(
      viewer: Viewer,
      projectId: string,
      sha: string,
    ): Promise<GitCenterCommitDetail> {
      const project = await requireProject(viewer.organizationId, projectId);
      const runner = project.directory
        ? await canUseProjectRuntime(viewer.organizationId, viewer.userId, project.runtimeId)
        : null;

      if (runner && project.directory) {
        try {
          return (await runner.call(
            "git.commitDiff",
            { folder: project.directory, sha },
            SNAPSHOT_TIMEOUT_MS,
          )) as GitCommitDiffResult;
        } catch (error) {
          if (!UNKNOWN_CALL_RE.test(describeError(error))) {
            const ghRepo = await installationOf(viewer.organizationId, project);

            if (!ghRepo) throw new UnprocessableError(describeError(error));
          }
        }
      }

      const ghRepo = await requireGithubRepo(viewer.organizationId, project);
      const detail = await github.commit(ghRepo.installationId, ghRepo.repo, sha);

      if (!detail) throw new NotFoundError("Commit not found");

      return {
        sha: detail.sha,
        message: detail.message,
        body: "",
        author: detail.author,
        authorEmail: null,
        date: detail.date,
        parents: detail.parents,
        patch: patchFromGithubFiles(detail.files),
        truncated: detail.filesTruncated,
        additions: detail.additions,
        deletions: detail.deletions,
        filesChanged: detail.files.length,
        url: detail.url,
      };
    },

    async workspace(
      viewer: Viewer,
      projectId: string,
      query: WorkspaceQuery,
    ): Promise<GitCenterWorkspaceResponse> {
      const project = await requireProject(viewer.organizationId, projectId);

      if (query.threadId) {
        const thread = await threadsService.readable(viewer, query.threadId);

        if (thread.projectId !== project.id) throw new NotFoundError("Thread not in this project");

        const runner = await canUseProjectRuntime(
          viewer.organizationId,
          viewer.userId,
          thread.runtimeId,
        );

        if (!runner) throw new UnavailableError("The thread's computer is offline");

        const status = (await runner.call(
          "git.workspaceStatus",
          {
            target: { kind: "thread", threadId: thread.id },
            filePath: query.filePath,
            staged: query.staged,
          },
          SNAPSHOT_TIMEOUT_MS,
        )) as GitWorkspaceStatusResult;

        const running = runs.isRunning(thread.id);
        const canMutate =
          !running && (thread.createdBy === viewer.userId || isDriving(thread.drivingUntil));

        return {
          target: { kind: "thread", threadId: thread.id, title: thread.title },
          running,
          canMutate,
          ...status,
        };
      }

      if (!project.directory) {
        throw new UnprocessableError("This project does not have a local folder checkout");
      }

      const runner = await canUseProjectRuntime(
        viewer.organizationId,
        viewer.userId,
        project.runtimeId,
      );

      if (!runner) throw new UnavailableError("The project's computer is offline");

      const status = (await runner.call(
        "git.workspaceStatus",
        {
          target: { kind: "project", folder: project.directory },
          filePath: query.filePath,
          staged: query.staged,
        },
        SNAPSHOT_TIMEOUT_MS,
      )) as GitWorkspaceStatusResult;

      return {
        target: { kind: "project" },
        running: false,
        canMutate: true,
        ...status,
      };
    },

    async reflog(
      viewer: Viewer,
      projectId: string,
      query: ReflogQuery,
    ): Promise<GitCenterReflogResponse> {
      const project = await requireProject(viewer.organizationId, projectId);

      if (query.threadId) {
        const thread = await threadsService.readable(viewer, query.threadId);

        if (thread.projectId !== project.id) throw new NotFoundError("Thread not in this project");

        const runner = await canUseProjectRuntime(
          viewer.organizationId,
          viewer.userId,
          thread.runtimeId,
        );

        if (!runner) throw new UnavailableError("The thread's computer is offline");

        return (await runner.call(
          "git.reflog",
          { target: { kind: "thread", threadId: thread.id }, limit: query.limit },
          SNAPSHOT_TIMEOUT_MS,
        )) as GitReflogResult;
      }

      if (!project.directory) return { entries: [] };

      const runner = await canUseProjectRuntime(
        viewer.organizationId,
        viewer.userId,
        project.runtimeId,
      );

      if (!runner) throw new UnavailableError("The project's computer is offline");

      return (await runner.call(
        "git.reflog",
        { target: { kind: "project", folder: project.directory }, limit: query.limit },
        SNAPSHOT_TIMEOUT_MS,
      )) as GitReflogResult;
    },

    async action(viewer: Viewer, projectId: string, body: GitActionBody): Promise<GitActionResult> {
      const project = await requireProject(viewer.organizationId, projectId);
      let runtimeId = project.runtimeId;
      let target: GitWorkspaceTarget;

      if (body.target.kind === "thread") {
        const thread = await threadsService.readable(viewer, body.target.threadId);

        if (thread.projectId !== project.id) throw new NotFoundError("Thread not in this project");

        if (thread.createdBy !== viewer.userId && !isDriving(thread.drivingUntil)) {
          throw new ForbiddenError("Only the thread owner or an active driver can run git actions");
        }

        if (runs.isRunning(thread.id)) {
          throw new ConflictError("Stop the active run before modifying this thread's workspace");
        }

        runtimeId = thread.runtimeId;
        target = { kind: "thread", threadId: thread.id };
      } else {
        if (!project.directory) {
          throw new UnprocessableError("This project has no local folder checkout on a runner");
        }

        target = { kind: "project", folder: project.directory };
      }

      const runner = await canUseProjectRuntime(viewer.organizationId, viewer.userId, runtimeId);

      if (!runner) throw new UnavailableError("The computer is offline");

      const userGrant = await githubUserTokenService.use(viewer.userId).catch(() => null);
      const auth = userGrant
        ? {
            token: userGrant.token,
            login: userGrant.identity.login,
            name: userGrant.identity.name,
          }
        : undefined;

      try {
        return (await runner.call(
          "git.action",
          { target, action: body.action, auth },
          ACTION_TIMEOUT_MS,
        )) as GitActionResult;
      } catch (error) {
        const reason = describeError(error);

        if (UNKNOWN_CALL_RE.test(reason)) {
          throw new ConflictError("Update this computer's runner to use Git Center actions");
        }

        throw new UnprocessableError(reason);
      }
    },

    async pullDetail(
      viewer: Viewer,
      projectId: string,
      number: number,
    ): Promise<GitCenterPullDetailResponse> {
      const project = await requireProject(viewer.organizationId, projectId);
      const ghRepo = await requireGithubRepo(viewer.organizationId, project);
      const [pull, unresolvedComments, userToken] = await Promise.all([
        github.pull(ghRepo.installationId, ghRepo.repo, number),
        github.unresolvedReviewComments(ghRepo.installationId, ghRepo.repo, number).catch(() => []),
        githubUserTokenService.use(viewer.userId).catch(() => null),
      ]);

      if (!pull) throw new NotFoundError(`Pull request #${number} not found`);

      return {
        pull,
        unresolvedComments,
        githubConnected: userToken !== null,
      };
    },

    async checkLogs(
      viewer: Viewer,
      projectId: string,
      checkRunId: number,
    ): Promise<GitCenterCheckLogResponse> {
      const project = await requireProject(viewer.organizationId, projectId);
      const ghRepo = await requireGithubRepo(viewer.organizationId, project);
      const userGrant = await githubUserTokenService.use(viewer.userId).catch(() => null);
      const token =
        userGrant?.token ?? (await github.installationToken(ghRepo.installationId)).token;
      try {
        return await github.checkRunLogs(token, ghRepo.repo, checkRunId);
      } catch (error) {
        if (error instanceof GithubApiError && error.status === 403) {
          return {
            checkRunId,
            name: `Check #${checkRunId}`,
            summary: null,
            text: null,
            logs: null,
            url: null,
            scopeRequired: true,
          };
        }

        throw error;
      }
    },

    async createPull(viewer: Viewer, projectId: string, body: CreatePullBody) {
      const project = await requireProject(viewer.organizationId, projectId);
      const ghRepo = await requireGithubRepo(viewer.organizationId, project);
      const grant = await requireUserGithubToken(viewer.userId);
      try {
        return await github.createPull(grant.token, ghRepo.repo, body);
      } catch (error) {
        mapGithubWriteError(error);
      }
    },

    async reviewPull(viewer: Viewer, projectId: string, number: number, body: ReviewPullBody) {
      const project = await requireProject(viewer.organizationId, projectId);
      const ghRepo = await requireGithubRepo(viewer.organizationId, project);
      const grant = await requireUserGithubToken(viewer.userId);
      try {
        return await github.reviewPull(grant.token, ghRepo.repo, number, body);
      } catch (error) {
        mapGithubWriteError(error);
      }
    },

    async mergePull(viewer: Viewer, projectId: string, number: number, body: MergePullBody) {
      const project = await requireProject(viewer.organizationId, projectId);
      const ghRepo = await requireGithubRepo(viewer.organizationId, project);
      const grant = await requireUserGithubToken(viewer.userId);
      try {
        return await github.mergePull(grant.token, ghRepo.repo, number, body);
      } catch (error) {
        mapGithubWriteError(error);
      }
    },

    async updatePullBranch(viewer: Viewer, projectId: string, number: number) {
      const project = await requireProject(viewer.organizationId, projectId);
      const ghRepo = await requireGithubRepo(viewer.organizationId, project);
      const grant = await requireUserGithubToken(viewer.userId);
      try {
        return await github.updatePullBranch(grant.token, ghRepo.repo, number);
      } catch (error) {
        mapGithubWriteError(error);
      }
    },

    async updatePullState(
      viewer: Viewer,
      projectId: string,
      number: number,
      body: UpdatePullStateBody,
    ) {
      const project = await requireProject(viewer.organizationId, projectId);
      const ghRepo = await requireGithubRepo(viewer.organizationId, project);
      const grant = await requireUserGithubToken(viewer.userId);
      try {
        return await github.updatePullState(grant.token, ghRepo.repo, number, body.state);
      } catch (error) {
        mapGithubWriteError(error);
      }
    },

    async handoff(
      viewer: Viewer,
      projectId: string,
      body: HandoffBody,
    ): Promise<GitCenterHandoffResult> {
      const project = await requireProject(viewer.organizationId, projectId);

      if (body.kind === "resolve_conflicts" && body.threadId) {
        const thread = await threadsService.readable(viewer, body.threadId);

        if (thread.projectId !== project.id) throw new NotFoundError("Thread not in this project");

        if (thread.createdBy !== viewer.userId && !isDriving(thread.drivingUntil)) {
          throw new ForbiddenError(
            "Only the thread owner or an active driver can hand off conflict resolution",
          );
        }

        if (runs.isRunning(thread.id)) {
          throw new ConflictError("Stop the active run before handing off conflict resolution");
        }

        const prompt = [
          `Resolve the active git ${body.operation} conflicts in this workspace.`,
          `Conflicted files:\n${body.files.map((f) => `- ${f}`).join("\n")}`,
          "Inspect each conflict carefully, keep the intended changes from both sides, stage the resolved files, and verify the repo builds/tests cleanly.",
        ].join("\n\n");
        await messages.send(viewer.organizationId, viewer.userId, thread.id, { prompt });
        return { threadId: thread.id, created: false };
      }

      let title: string;
      let prompt: string;

      if (body.kind === "start_from_ref") {
        title = `Work from ${body.ref}`;
        prompt = body.prompt?.trim()
          ? `Start from git ref \`${body.ref}\` (check it out or create a working branch from it first).\n\n${body.prompt.trim()}`
          : `Check out git ref \`${body.ref}\` and summarize the current state and recent changes so we can continue from here.`;
      } else if (body.kind === "resolve_conflicts") {
        title = `Resolve ${body.operation} conflicts`;
        prompt = [
          `Resolve the active git ${body.operation} conflicts in this repository.`,
          `Conflicted files:\n${body.files.map((f) => `- ${f}`).join("\n")}`,
          "Inspect each conflict carefully, stage the resolved files, and run checks to confirm everything passes.",
        ].join("\n\n");
      } else {
        title = `Fix CI: ${body.checkName} (#${body.pullNumber})`;
        prompt = [
          `Fix the failing CI check "${body.checkName}" on PR #${body.pullNumber} (branch \`${body.branch}\`).`,
          "Check out the PR branch, reproduce the failure locally, fix the root cause, and verify checks pass.",
          body.logSnippet ? `Failure output:\n\`\`\`\n${body.logSnippet.slice(-6000)}\n\`\`\`` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
      }

      const thread = await threadsService.create(viewer.organizationId, viewer.userId, {
        projectId: project.id,
        title: title.slice(0, 120),
      });

      await messages.send(viewer.organizationId, viewer.userId, thread.id, { prompt });
      return { threadId: thread.id, created: true };
    },
  };
}
