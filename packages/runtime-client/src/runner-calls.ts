import type {
  FilesCallMethod,
  ProcessesCallMethod,
  RunnerCallMethod,
  SteerResult,
} from "@aven/protocol/runtime-wire";

import {
  artifactsReadParams,
  desktopCallParams,
  diffGetParams,
  filesCallParams,
  filesSearchParams,
  processesCallParams,
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
  idle: Pick<IdleRelease, "schedule" | "starting">;
  /** What the person said to a run that is going (decision 0098). */
  steer(params: SteerParams): Promise<SteerResult>;
};

// What the control plane asks a runner about a thread: its changes, its files, an image the agent
// showed, its processes, or its desktop. Returns what answers one call of the control plane's.
export function createRunnerCalls({ sandbox, boxes, viewers, idle, steer }: RunnerCallsContext) {
  // A thread's changes; null when it has no workspace on this runner yet.
  async function diffOf(params: unknown) {
    const { threadId, scope } = diffGetParams(params);
    const root = await sandbox.workspace(threadId);
    return root ? threadDiff(root, scope) : null;
  }

  // A folder or a file of a thread's workspace; null when it has no workspace on this runner yet.
  async function filesOf(method: Exclude<FilesCallMethod, "files.search">, params: unknown) {
    const { threadId, path } = filesCallParams(params);
    const root = await sandbox.workspace(threadId);
    if (!root) return null;
    return method === "files.list"
      ? { entries: await listDirectory(root, path) }
      : readWorkspaceFile(root, path);
  }

  // The files of a thread's workspace that match the composer's `@`; null without a workspace.
  async function searchOf(params: unknown) {
    const { threadId, query } = filesSearchParams(params);
    const root = await sandbox.workspace(threadId);
    return root ? { paths: await searchWorkspace(root, query) } : null;
  }

  // An image the thread's agent showed; null when this runner does not have it. Read from the
  // runner's own disk, so it does not need the thread's sandbox to be running (decision 0033).
  async function artifactOf(params: unknown) {
    const { threadId, name } = artifactsReadParams(params);
    return (await sandbox.artifacts?.read(threadId, name)) ?? null;
  }

  // The processes in a thread's sandbox. A sandbox that is not up has none, and these calls never
  // start one (decision 0071); a stop or a read of the logs of a process that is not there is an error.
  async function processesOf(method: ProcessesCallMethod, params: unknown) {
    const { threadId, processId } = processesCallParams(params);
    const box = boxes.get(threadId);
    if (method === "processes.list") return { processes: (await box?.processes.list()) ?? [] };
    if (!box || !processId) throw new Error("No such process");
    if (method === "processes.stop") return { processes: await box.processes.stop(processId) };
    return box.processes.logs(processId);
  }

  // Starts a thread's sandbox without a run, for a person who wants its desktop (decision 0039); the
  // idle clock frees it again if nothing uses it. A thread that never ran has no workspace to
  // start it on, and the clone is made by a run. A bot's computer has no repository: it is started
  // as it is (decision 0059).
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
    // A thread's container is up already; a bot's starts here.
    await box.start?.();
    idle.schedule(threadId);
    return viewers.call("desktop.status", { threadId });
  }

  return function callOf(method: RunnerCallMethod, params: unknown) {
    if (method === "run.steer") return steer(steerParams(params));
    if (method === "desktop.wake") return wakeOf(params);
    if (method === "diff.get") return diffOf(params);
    if (method === "artifacts.read") return artifactOf(params);
    if (method === "files.list" || method === "files.read") return filesOf(method, params);
    if (method === "files.search") return searchOf(params);
    if (method === "processes.list" || method === "processes.stop" || method === "processes.logs")
      return processesOf(method, params);
    return viewers.call(method, params);
  };
}
