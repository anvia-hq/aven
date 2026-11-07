import type { ProcessEndWatch } from "./process-end-watch";
import type {
  FilesCallMethod,
  ProcessesCallMethod,
  RunnerCallMethod,
  RunnerUpdateResult,
  SteerResult,
} from "@aven/protocol/runtime-wire";

import {
  artifactsReadParams,
  desktopCallParams,
  diffGetParams,
  filesCallParams,
  filesSearchParams,
  processesCallParams,
  runnerUpdateParams,
  sandboxReleaseParams,
  steerParams,
  type SteerParams,
} from "./call-params";
import type { DesktopViewers } from "./desktop-viewers";
import type { IdleRelease } from "./idle-release";
import type { ThreadSandbox, ThreadWorkspaces } from "./sandbox";
import { threadDiff } from "./thread-diff";
import { listDirectory, readWorkspaceFile, searchWorkspace } from "./workspace-files";

export type RunnerCallsContext = {
  sandbox: ThreadWorkspaces;
  boxes: Map<string, ThreadSandbox>;
  viewers: Pick<DesktopViewers, "call">;
  idle: Pick<IdleRelease, "schedule" | "starting" | "releaseNow">;
  update?: {
    start(release: string | undefined): void;
    busy(): string | undefined;
  };
  processEnds: Pick<ProcessEndWatch, "ignore">;
  steer(params: SteerParams): Promise<SteerResult>;
};

const UPDATE_DELAY_MS = 1000;

export function createRunnerCalls({
  sandbox,
  boxes,
  viewers,
  idle,
  processEnds,
  update,
  steer,
}: RunnerCallsContext) {
  async function diffOf(params: unknown) {
    const { threadId, scope } = diffGetParams(params);
    const root = await sandbox.workspace(threadId);
    return root ? threadDiff(root, scope) : null;
  }

  async function filesOf(method: Exclude<FilesCallMethod, "files.search">, params: unknown) {
    const { threadId, path } = filesCallParams(params);
    const root = await sandbox.workspace(threadId);
    if (!root) return null;
    return method === "files.list"
      ? { entries: await listDirectory(root, path) }
      : readWorkspaceFile(root, path);
  }

  async function searchOf(params: unknown) {
    const { threadId, query } = filesSearchParams(params);
    const root = await sandbox.workspace(threadId);
    return root ? { paths: await searchWorkspace(root, query) } : null;
  }

  async function artifactOf(params: unknown) {
    const { threadId, name } = artifactsReadParams(params);
    return (await sandbox.artifacts?.read(threadId, name)) ?? null;
  }

  async function processesOf(method: ProcessesCallMethod, params: unknown) {
    const { threadId, processId } = processesCallParams(params);
    const box = boxes.get(threadId);
    if (method === "processes.list") return { processes: (await box?.processes.list()) ?? [] };
    if (!box || !processId) throw new Error("No such process");
    if (method === "processes.stop") {
      processEnds.ignore(threadId, processId);
      return { processes: await box.processes.stop(processId) };
    }
    return box.processes.logs(processId);
  }

  async function wakeOf(params: unknown) {
    const { threadId, bot } = desktopCallParams(params);
    await idle.starting(threadId);
    const box = await sandbox.acquire(
      { id: threadId },
      bot
        ? undefined
        : async () => {
            throw new Error("The thread has no workspace yet");
          },
    );
    boxes.set(threadId, box);
    await box.start?.();
    idle.schedule(threadId);
    return viewers.call("desktop.status", { threadId });
  }

  async function updateOf(params: unknown): Promise<RunnerUpdateResult> {
    const { release } = runnerUpdateParams(params);
    if (!update) return { status: "unsupported" };
    const reason = update.busy();
    if (reason) return { status: "busy", reason };
    setTimeout(() => update.start(release), UPDATE_DELAY_MS);
    return { status: "started" };
  }

  return function callOf(method: RunnerCallMethod, params: unknown) {
    if (method === "runner.update") return updateOf(params);
    if (method === "run.steer") return steer(steerParams(params));
    if (method === "desktop.wake") return wakeOf(params);
    if (method === "diff.get") return diffOf(params);
    if (method === "artifacts.read") return artifactOf(params);
    if (method === "files.list" || method === "files.read") return filesOf(method, params);
    if (method === "files.search") return searchOf(params);
    if (method === "processes.list" || method === "processes.stop" || method === "processes.logs")
      return processesOf(method, params);
    if (method === "sandbox.release") {
      const { threadId } = sandboxReleaseParams(params);
      return idle.releaseNow(threadId).then((released) => ({ released }));
    }
    return viewers.call(method, params);
  };
}
