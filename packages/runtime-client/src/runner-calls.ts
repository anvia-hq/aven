import {
  actionRunParams,
  artifactsReadParams,
  desktopCallParams,
  environmentSaveParams,
  diffGetParams,
  dockerRemoveParams,
  filesCallParams,
  filesSearchParams,
  processesCallParams,
  runnerUpdateParams,
  sandboxReleaseParams,
  steerParams,
} from "./call-params";
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
  viewers,
  idle,
  processEnds,
  update,
  steer,
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

  async function actionOf(params: unknown) {
    const { threadId, command } = actionRunParams(params);
    await wakeOf({ threadId });
    const box = boxes.get(threadId);
    if (!box) throw new Error("The sandbox is not running");
    const process = await box.processes.start(command);
    processEnds.ignore(threadId, process.id);
    return { process };
  }

  async function saveEnvironmentOf(params: unknown) {
    const { threadId, organizationId, access } = environmentSaveParams(params);
    if (!sandbox.saveEnvironment) throw new Error("This runner cannot save environments");
    return sandbox.saveEnvironment({ id: threadId, organizationId }, access);
  }

  async function readEnvironmentOf(params: unknown) {
    const { threadId, organizationId, access } = environmentSaveParams(params);
    if (!sandbox.environmentSavedAt) throw new Error("This runner cannot read environments");
    return { savedAt: await sandbox.environmentSavedAt({ id: threadId, organizationId }, access) };
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
    if (method === "actions.run") return actionOf(params);
    if (method === "environment.save") return saveEnvironmentOf(params);
    if (method === "environment.read") return readEnvironmentOf(params);
    if (method === "desktop.wake") return wakeOf(params);
    if (method === "diff.get") return diffOf(params);
    if (method === "artifacts.read") return artifactOf(params);
    if (method === "files.list" || method === "files.read") return filesOf(method, params);
    if (method === "files.search") return searchOf(params);
    if (method === "processes.list" || method === "processes.stop" || method === "processes.logs")
      return processesOf(method, params);
    if (method === "docker.leftovers") {
      if (!sandbox.leftovers) throw new Error("This runner cannot list Docker leftovers");
      return sandbox.leftovers();
    }
    if (method === "docker.remove") {
      if (!sandbox.removeLeftovers) throw new Error("This runner cannot remove Docker leftovers");
      return sandbox.removeLeftovers(dockerRemoveParams(params));
    }
    if (method === "sandbox.release") {
      const { threadId } = sandboxReleaseParams(params);
      return idle.releaseNow(threadId).then(async (released) => {
        await sandbox.putAway?.(threadId);
        return { released };
      });
    }
    return viewers.call(method, params);
  };
}
