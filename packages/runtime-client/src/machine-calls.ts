import { asRecord } from "@aven/agents/values";
import type { SandboxExecOptions, SandboxRuntime } from "@anvia/sandbox";
import type { MachineCallParams, RepoAccess, RunEnvVar, RunSkill } from "@aven/protocol/types";

import { fetchBranch } from "./fetch-branch";
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

export function createMachineCalls({ sandbox, boxes, idle }: MachineCallsContext) {
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
      case "exec": {
        const result = await (
          await runtimeOf(threadId)
        ).exec(args as unknown as SandboxExecOptions);
        return { ...result, stdout: result.stdout.toBase64(), stderr: result.stderr.toBase64() };
      }
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
      case "startProcess":
        return (await runtimeOf(threadId)).startProcess(
          args as unknown as Parameters<SandboxRuntime["startProcess"]>[0],
        );
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
        return {
          path: await sandbox.uploads.save(threadId, textOf(args.name), bytesOf(args.data)),
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
