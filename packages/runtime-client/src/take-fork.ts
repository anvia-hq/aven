import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { forkChanges } from "./thread-diff";
import type { TakenChanges } from "@aven/agents/tools/types";
import type { ThreadWorkspaces } from "./types";

const PATCHES = "aven-forks";

const filesOf = (patch: string) =>
  [...patch.matchAll(/^diff --git a\/.+ b\/(.+)$/gm)].map((match) => match[1]!);

export async function takeFork(
  sandbox: Pick<ThreadWorkspaces, "workspace" | "paths">,
  threadId: string,
  forkId: string,
): Promise<TakenChanges> {
  const forked = await sandbox.workspace(forkId);

  if (!forked) throw new Error("The fork has no workspace on this runner");

  const parent = await sandbox.workspace(threadId);

  if (!parent) throw new Error("This thread has no workspace yet");

  const changes = await forkChanges(forked);

  if (!changes) throw new Error("The fork's workspace was not made as a fork of this one");

  if (changes.truncated) {
    throw new Error(
      "The fork's changes are too large to take as one patch: ask it to commit them in parts and say which files",
    );
  }

  if (!changes.patch) return { empty: true };

  const name = `${forkId.slice(0, 8)}.patch`;
  const directory = join(parent, ".git", PATCHES);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), changes.patch);
  return {
    empty: false,
    patchPath: `${sandbox.paths?.(threadId)?.workspace ?? "/workspace"}/.git/${PATCHES}/${name}`,
    files: filesOf(changes.patch),
  };
}
