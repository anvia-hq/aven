import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoAccess } from "@aven/protocol/runtime-wire";

import { git } from "../git-clone";

export async function createRemoteRepo(token = "test-token") {
  const dir = await mkdtemp(join(tmpdir(), "aven-remote-"));
  await Bun.write(join(dir, "README.md"), "# remote\n");
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["config", "user.email", "t@aven.test"],
    ["config", "user.name", "T"],
    ["add", "."],
    ["commit", "-q", "-m", "add readme"],
  ]) {
    await git(args, { cwd: dir });
  }
  const access: RepoAccess = { cloneUrl: dir, defaultBranch: "main", token };
  return { dir, access };
}
