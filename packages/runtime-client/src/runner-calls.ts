import {
  actionRunParams,
  artifactsReadParams,
  computerCallParams,
  diffGetParams,
  filesCallParams,
  foldersCreateParams,
  foldersListParams,
  filesSearchParams,
  processesCallParams,
  runnerUpdateParams,
  sandboxReleaseParams,
  steerParams,
} from "./call-params";
import { createFolder, listFolders } from "./folder-browser";
import { currentBranch, threadDiff } from "./thread-diff";
import { listDirectory, readWorkspaceFile, searchWorkspace } from "./workspace-files";
import type {
  FilesCallMethod,
  ProcessesCallMethod,
  RunnerCallMethod,
  RunnerUpdateResult,
} from "@aven/protocol/types";
import type { RunnerCallsContext } from "./types";

const UPDATE_DELAY_MS = 1000;

export function createRunnerCalls({
  sandbox,
  boxes,
  idle,
  processEnds,
  update,
  steer,
  dirs = [],
}: RunnerCallsContext) {
  async function diffOf(params: unknown) {
    const { threadId, scope } = diffGetParams(params);
    const root = await sandbox.workspace(threadId);
    const diff = root ? await threadDiff(root, scope) : null;
    return root && diff ? { ...diff, branch: await currentBranch(root) } : null;
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

  async function computerOf(params: unknown) {
    const { threadId } = computerCallParams(params);
    return (await sandbox.workspace(threadId)) ? { state: "awake" as const } : null;
  }

  async function wakeOf(params: unknown) {
    const { threadId, bot } = computerCallParams(params);
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
    return { state: "awake" as const };
  }

  async function actionOf(params: unknown) {
    const { threadId, command } = actionRunParams(params);
    await wakeOf({ threadId });
    const box = boxes.get(threadId);
    if (!box) throw new Error("The computer is not running");
    const process = await box.processes.start(command);
    processEnds.ignore(threadId, process.id);
    return { process };
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
    if (method === "folders.list") return listFolders(dirs, foldersListParams(params).path);
    if (method === "folders.create") {
      const { path, name } = foldersCreateParams(params);
      return createFolder(dirs, path, name);
    }
    if (method === "run.steer") return steer(steerParams(params));
    if (method === "actions.run") return actionOf(params);
    if (method === "computer.status") return computerOf(params);
    if (method === "computer.wake") return wakeOf(params);
    if (method === "diff.get") return diffOf(params);
    if (method === "artifacts.read") return artifactOf(params);
    if (method === "files.list" || method === "files.read") return filesOf(method, params);
    if (method === "files.search") return searchOf(params);
    if (method === "processes.list" || method === "processes.stop" || method === "processes.logs")
      return processesOf(method, params);
    if (method === "sandbox.release") {
      const { threadId } = sandboxReleaseParams(params);
      return idle.releaseNow(threadId).then(async (released) => {
        await sandbox.putAway?.(threadId);
        return { released };
      });
    }
    throw new Error(`Unknown call ${method}`);
  };
}
