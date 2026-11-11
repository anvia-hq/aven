import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { forkChanges } from "./thread-diff";
import type { ForkHost } from "@aven/agents/tools/types";
import type { ForkView, RuntimeCalls } from "@aven/protocol/types";
import type { ThreadWorkspaces } from "./types";

type ForkCall = <M extends "fork.start" | "fork.status">(
  method: M,
  params: RuntimeCalls[M]["params"],
) => Promise<RuntimeCalls[M]["result"]>;

const PATCHES = "aven-forks";

const filesOf = (patch: string) =>
  [...patch.matchAll(/^diff --git a\/.+ b\/(.+)$/gm)].map((match) => match[1]!);

export function createForkHost({
  runId,
  thread,
  sandbox,
  call,
  redact,
}: {
  runId: string;
  thread: { id: string };
  sandbox: Pick<ThreadWorkspaces, "workspace" | "paths">;
  call: ForkCall;
  redact?: (text: string) => string;
}): ForkHost {
  const status = async (id: string): Promise<ForkView> => {
    const view = await call("fork.status", { runId, id });
    return redact ? { ...view, lastMessage: redact(view.lastMessage) } : view;
  };
  return {
    start: (input) => call("fork.start", { runId, ...input }),
    status,
    async take(id) {
      await status(id);
      const forked = await sandbox.workspace(id);
      if (!forked) throw new Error("The fork has no workspace on this runner");
      const parent = await sandbox.workspace(thread.id);
      if (!parent) throw new Error("This thread has no workspace yet");
      const changes = await forkChanges(forked);
      if (!changes) throw new Error("The fork's workspace was not made as a fork of this one");
      if (changes.truncated) {
        throw new Error(
          "The fork's changes are too large to take as one patch: ask it to commit them in parts and say which files",
        );
      }
      if (!changes.patch) return { empty: true };
      const directory = join(parent, ".git", PATCHES);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `${id.slice(0, 8)}.patch`), changes.patch);
      return {
        empty: false,
        patchPath: `${sandbox.paths?.(thread.id)?.workspace ?? "/workspace"}/.git/${PATCHES}/${id.slice(0, 8)}.patch`,
        files: filesOf(changes.patch),
      };
    },
  };
}
