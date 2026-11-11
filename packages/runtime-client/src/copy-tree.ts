import { mkdir, readdir, rm, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { runCommand } from "./run-command";

async function cloneDirectory(from: string, to: string) {
  if (process.platform !== "darwin") return false;
  try {
    await mkdir(dirname(to), { recursive: true });
    await rmdir(to).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    const { dlopen, FFIType } = await import("bun:ffi");
    const { symbols } = dlopen("libSystem.B.dylib", {
      clonefile: { args: [FFIType.cstring, FFIType.cstring, FFIType.u32], returns: FFIType.i32 },
    });
    return symbols.clonefile(Buffer.from(`${from}\0`), Buffer.from(`${to}\0`), 0) === 0;
  } catch {
    return false;
  }
}

export async function copyTree(from: string, to: string) {
  if (await cloneDirectory(from, to)) return;
  await mkdir(to, { recursive: true });
  const attempts =
    process.platform === "darwin"
      ? [
          ["cp", "-cpPRf"],
          ["cp", "-pPRf"],
        ]
      : [
          ["cp", "-af", "--reflink=auto"],
          ["cp", "-af"],
        ];
  const failures: string[] = [];
  for (const command of attempts) {
    const copied = await runCommand([...command, `${from}/.`, to]);
    if (copied.code === 0) return;
    failures.push(copied.stderr.trim());
  }
  throw new Error(`Could not copy ${from}: ${failures[0]}`);
}

async function copyEach(from: string, to: string, skip: string, flags: string[]) {
  const failures: string[] = [];
  for (const name of await readdir(from)) {
    if (name === skip) continue;
    const copied = await runCommand(["cp", ...flags, "--", join(from, name), `${to}/`]);
    if (copied.code !== 0) failures.push(copied.stderr.trim());
  }
  if (failures.length > 0) throw new Error(`Could not copy ${from}: ${failures[0]}`);
}

export async function copyTreeSharingObjects(from: string, to: string) {
  if (process.platform === "darwin") return copyTree(from, to);
  await mkdir(to, { recursive: true });
  const shared = await runCommand(["cp", "-a", "--reflink=always", `${from}/.`, to]);
  if (shared.code === 0) return;
  for (const name of await readdir(to)) await rm(join(to, name), { recursive: true, force: true });
  await copyEach(from, to, ".git", ["-a"]);
  const gitDir = join(from, ".git");
  const target = join(to, ".git");
  await mkdir(target, { recursive: true });
  await copyEach(gitDir, target, "objects", ["-a"]);
  const linked = await runCommand(["cp", "-al", "--", join(gitDir, "objects"), `${target}/`]);
  if (linked.code !== 0) await copyTree(join(gitDir, "objects"), join(target, "objects"));
}
