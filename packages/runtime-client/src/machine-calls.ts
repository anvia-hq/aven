import { asRecord } from "@aven/agents/values";
import type { SandboxExecOptions, SandboxRuntime } from "@anvia/sandbox";
import type { MachineCallParams, RepoAccess, RunEnvVar, RunSkill } from "@aven/protocol/types";

import { fetchBranch } from "./fetch-branch";
import { takeFork } from "./take-fork";
import { markTurn } from "./thread-diff";
import type { MachineCallsContext, ThreadRef } from "./types";

const bytesOf = (data: unknown) => {
  if (typeof data !== "string") throw new Error("Invalid parameters");
  return Uint8Array.fromBase64(data);
};

const textOf = (value: unknown) => {
  if (typeof value !== "string") throw new Error("Invalid parameters");
  return value;
};

const OPERATION_ID_MAX = 512;
const REMEMBERED_STOPS = 64;

const operationIdOf = (value: unknown) => {
  if (typeof value !== "string" || value.length === 0 || value.length > OPERATION_ID_MAX) {
    throw new Error("Invalid parameters");
  }
  return value;
};

const commandKey = (threadId: string, operationId: string) => `${threadId}\0${operationId}`;

export function createMachineCalls({
  sandbox,
  boxes,
  idle,
  machineProcesses,
}: MachineCallsContext) {
  const running = new Map<string, AbortController>();
  const stopped = new Set<string>();

  function rememberStop(key: string) {
    stopped.add(key);
    while (stopped.size > REMEMBERED_STOPS) {
      const oldest = stopped.values().next().value;
      if (oldest === undefined) return;
      stopped.delete(oldest);
    }
  }

  function stopExec(threadId: string, operationId: string) {
    const key = commandKey(threadId, operationId);
    const command = running.get(key);
    if (command) {
      command.abort();
      return;
    }
    rememberStop(key);
  }

  async function prepare(threadId: string, args: Record<string, unknown>) {
    const thread = { ...(asRecord(args.thread) as ThreadRef), id: threadId };
    const repo = args.repo as RepoAccess | undefined;
    const folder = args.folder as string | null | undefined;
    await idle.starting(threadId);
    const box = await sandbox.acquire(thread, repo ? async () => repo : undefined, {
      lazy: args.lazy === true,
      folder: async () => folder ?? null,
    });
    boxes.set(threadId, box);
    await machineProcesses.begin(threadId);
    return { paths: sandbox.paths?.(threadId) ?? null };
  }

  async function runtimeOf(threadId: string): Promise<SandboxRuntime> {
    const known = boxes.get(threadId)?.runtime;
    if (known) return known;
    if (!(await sandbox.workspace(threadId))) {
      throw new Error("This thread's computer is not prepared");
    }
    await idle.starting(threadId);
    const box = await sandbox.acquire({ id: threadId });
    boxes.set(threadId, box);
    if (!box.runtime) throw new Error("This runner cannot lend its computer");
    return box.runtime;
  }

  async function runExec(threadId: string, args: Record<string, unknown>) {
    const operationId =
      args.operationId === undefined ? undefined : operationIdOf(args.operationId);
    const key = operationId ? commandKey(threadId, operationId) : undefined;
    const controller = new AbortController();
    if (key) {
      if (stopped.delete(key)) controller.abort();
      running.set(key, controller);
    }
    const options: Record<string, unknown> = { ...args };
    if (key) options.abortSignal = controller.signal;
    try {
      const result = await (
        await runtimeOf(threadId)
      ).exec(options as unknown as SandboxExecOptions);
      return { ...result, stdout: result.stdout.toBase64(), stderr: result.stderr.toBase64() };
    } finally {
      if (key) running.delete(key);
    }
  }

  async function onMachine(
    threadId: string,
    op: MachineCallParams["op"],
    args: Record<string, unknown>,
  ) {
    switch (op) {
      case "prepare":
        return prepare(threadId, args);
      case "workspace":
        return { path: (await sandbox.workspace(threadId)) ?? null };
      case "paths":
        return sandbox.paths?.(threadId) ?? null;
      case "release":
        await idle.releaseNow(threadId);
        return null;
      case "putAway":
        await idle.releaseNow(threadId);
        await sandbox.putAway?.(threadId);
        return null;
      case "setProjectEnv":
        sandbox.setProjectEnv?.(threadId, args.env as RunEnvVar[] | undefined);
        return null;
      case "exec":
        return runExec(threadId, args);
      case "exec.abort":
        stopExec(threadId, operationIdOf(args.operationId));
        return null;
      case "readFile":
        return {
          data: (
            await (await runtimeOf(threadId)).readFile({ path: textOf(args.path) })
          ).toBase64(),
        };
      case "readTextFilePage":
        return (await runtimeOf(threadId)).readTextFilePage({
          path: textOf(args.path),
          startLine: args.startLine as number | undefined,
          lineCount: args.lineCount as number | undefined,
        });
      case "writeFile":
        await (
          await runtimeOf(threadId)
        ).writeFile({
          path: textOf(args.path),
          data: bytesOf(args.data),
        });
        return null;
      case "listFiles":
        return (await runtimeOf(threadId)).listFiles({ path: args.path as string | undefined });
      case "startProcess": {
        const runtime = await runtimeOf(threadId);
        await machineProcesses.begin(threadId);
        return runtime.startProcess(
          args as unknown as Parameters<SandboxRuntime["startProcess"]>[0],
        );
      }
      case "listProcesses":
        return (await runtimeOf(threadId)).listProcesses();
      case "readProcessLogs": {
        const logs = await (
          await runtimeOf(threadId)
        ).readProcessLogs({
          processId: textOf(args.processId),
          tailBytes: args.tailBytes as number | undefined,
        });
        return { ...logs, stdout: logs.stdout.toBase64(), stderr: logs.stderr.toBase64() };
      }
      case "stopProcess":
        return (await runtimeOf(threadId)).stopProcess({ processId: textOf(args.processId) });
      case "uploads.save": {
        if (!sandbox.uploads) throw new Error("This runner cannot take attached files");
        const save = args.exact === true ? sandbox.uploads.put : sandbox.uploads.save;
        if (!save) throw new Error("This runner cannot take attached files under a given name");
        return {
          path: await save.call(sandbox.uploads, threadId, textOf(args.name), bytesOf(args.data)),
        };
      }
      case "artifacts.keep":
        if (!sandbox.artifacts) throw new Error("This runner keeps no images");
        await sandbox.artifacts.keep(threadId, textOf(args.name), bytesOf(args.data));
        return null;
      case "artifacts.save":
        if (!sandbox.artifacts) throw new Error("This runner keeps no images");
        return {
          name: await sandbox.artifacts.save(threadId, bytesOf(args.data), textOf(args.mediaType)),
        };
      case "skills.install":
        return installSkills(threadId, args);
      case "turn.mark": {
        const root = await sandbox.workspace(threadId);
        return root ? markTurn(root).catch(() => false) : false;
      }
      case "fork.take":
        return takeFork(sandbox, threadId, textOf(args.forkId));
      case "git.fetch": {
        const root = await sandbox.workspace(threadId);
        if (!root) throw new Error("The thread has no workspace yet");
        return fetchBranch(root, args.repo as RepoAccess, args.branch as string | undefined);
      }
    }
  }

  async function installSkills(threadId: string, args: Record<string, unknown>) {
    if (!sandbox.skills) throw new Error("This runner keeps no skills");
    const archives = asRecord(args.archives ?? {});
    const missing: string[] = [];
    const listings = await sandbox.skills.install(
      threadId,
      (args.skills ?? []) as RunSkill[],
      async (digest) => {
        const archive = archives[digest];
        if (typeof archive === "string") return Uint8Array.fromBase64(archive);
        missing.push(digest);
        throw new Error("Its archive was not sent");
      },
      await sandbox.workspace(threadId),
    );
    return missing.length ? { missing } : { listings };
  }

  return async function machineCall({ threadId, op, args }: MachineCallParams) {
    try {
      return await onMachine(threadId, op, asRecord(args ?? {}));
    } finally {
      if (op !== "release" && op !== "putAway") idle.schedule(threadId);
    }
  };
}
