import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { git, type Git } from "./git-clone";

const SAFE_CONFIG = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "credential.helper=",
  "-c",
  "commit.gpgSign=false",
  "-c",
  "gc.auto=0",
  "-c",
  "maintenance.auto=false",
  "-c",
  "protocol.allow=never",
  "-c",
  "protocol.https.allow=always",
  "-c",
  "protocol.file.allow=always",
];
const SAFE_ENV = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_NO_LAZY_FETCH: "1",
};

const LINKED = ["objects", "refs", "packed-refs", "logs", "reftable", "shallow"];
const REDIRECTS = ["commondir", "gitdir"];

const COPIED_KEY =
  /^(core\.(repositoryformatversion|filemode|symlinks|ignorecase|precomposeunicode|logallrefupdates)|extensions\.(objectformat|refstorage))$/;
const PLAIN_VALUE = /^[\w.-]+$/;
const CONFIG_TIMEOUT_MS = 10_000;

const NOT_A_REPOSITORY = { code: 128, stdout: "", stderr: "fatal: not a git repository" };

const kindOf = async (path: string) => {
  const stat = await lstat(path).catch(() => null);
  if (!stat) return "missing";
  if (stat.isSymbolicLink()) return "link";
  if (stat.isDirectory()) return "directory";
  return stat.isFile() ? "file" : "other";
};

async function readPlainFile(path: string) {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const file = await open(path, flags).catch(() => null);
  if (!file) return null;
  try {
    return (await file.stat()).isFile() ? await file.readFile("utf8") : null;
  } finally {
    await file.close();
  }
}

async function hasLink(dir: string, depth = Infinity): Promise<boolean> {
  if (depth === 0) return false;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  if (entries.some((entry) => entry.isSymbolicLink())) return true;
  const folders = entries.filter((entry) => entry.isDirectory());
  const found = await Promise.all(
    folders.map((entry) => hasLink(join(dir, entry.name), depth - 1)),
  );
  return found.includes(true);
}

async function isSafeRepository(repo: string) {
  if ((await kindOf(repo)) !== "directory") return false;
  if ((await kindOf(join(repo, "HEAD"))) !== "file") return false;
  if (!["file", "missing"].includes(await kindOf(join(repo, "config")))) return false;
  const kinds = await Promise.all(
    [...LINKED, ...REDIRECTS].map((name) => kindOf(join(repo, name))),
  );
  const linked = kinds.slice(0, LINKED.length);
  const redirects = kinds.slice(LINKED.length);
  if (linked.includes("link") || redirects.some((kind) => kind !== "missing")) return false;
  const nested = await Promise.all([
    hasLink(join(repo, "refs")),
    hasLink(join(repo, "logs")),
    hasLink(join(repo, "objects"), 2),
  ]);
  return !nested.includes(true);
}

async function safeConfig(repo: string, run: Git) {
  const read = await run(["config", "--file", join(repo, "config"), "--list", "-z"], {
    cwd: tmpdir(),
    env: SAFE_ENV,
    timeoutMs: CONFIG_TIMEOUT_MS,
  });
  const sections = new Map<string, string[]>([["core", ["bare = false"]]]);
  for (const entry of read.code === 0 ? read.stdout.split("\0") : []) {
    const [key = "", value = ""] = entry.split("\n");
    if (!COPIED_KEY.test(key) || !PLAIN_VALUE.test(value)) continue;
    const at = key.indexOf(".");
    const lines = sections.get(key.slice(0, at)) ?? [];
    lines.push(`${key.slice(at + 1)} = ${value}`);
    sections.set(key.slice(0, at), lines);
  }
  return [...sections].map(([name, lines]) => `[${name}]\n\t${lines.join("\n\t")}\n`).join("");
}

async function shadowOf(repo: string, run: Git) {
  const present = new Set(await readdir(repo));
  const linked = LINKED.filter((entry) => present.has(entry));
  const head = await readPlainFile(join(repo, "HEAD"));
  if (head === null) return null;
  const shadow = await mkdtemp(join(tmpdir(), "aven-git-"));
  try {
    await Promise.all(linked.map((entry) => symlink(join(repo, entry), join(shadow, entry))));
    await mkdir(join(shadow, "info"));
    const exclude = await readPlainFile(join(repo, "info", "exclude"));
    if (exclude !== null) await writeFile(join(shadow, "info", "exclude"), exclude);
    await writeFile(join(shadow, "config"), await safeConfig(repo, run));
    await writeFile(join(shadow, "HEAD"), head);
  } catch (error) {
    await rm(shadow, { recursive: true, force: true });
    throw error;
  }
  return { shadow, linked, head };
}

async function returnReplaced(shadow: string, linked: string[], repo: string, head: string) {
  for (const entry of linked) {
    if ((await kindOf(join(shadow, entry))) !== "link") {
      await rename(join(shadow, entry), join(repo, entry));
    }
  }
  if ((await Bun.file(join(shadow, "HEAD")).text()) === head) return;
  const moved = join(repo, `HEAD.aven-${crypto.randomUUID()}`);
  await rename(join(shadow, "HEAD"), moved).catch(async () => {
    await writeFile(moved, await Bun.file(join(shadow, "HEAD")).text());
  });
  await rename(moved, join(repo, "HEAD"));
}

export function hostGit(run: Git = git): Git {
  return async (args, options) => {
    const repo = join(options.cwd, ".git");
    if (!(await isSafeRepository(repo))) return NOT_A_REPOSITORY;
    const shadowed = await shadowOf(repo, run);
    if (!shadowed) return NOT_A_REPOSITORY;
    const { shadow, linked, head } = shadowed;
    try {
      const env = {
        ...SAFE_ENV,
        GIT_DIR: shadow,
        GIT_WORK_TREE: options.cwd,
        GIT_INDEX_FILE: join(repo, "index"),
        ...options.env,
      };
      const result = await run([...SAFE_CONFIG, ...args], { ...options, env });
      await returnReplaced(shadow, linked, repo, head);
      return result;
    } finally {
      await rm(shadow, { recursive: true, force: true });
    }
  };
}

export function gitFailure(what: string, output: { stderr: string; stdout: string }, token = "") {
  const text = (output.stderr || output.stdout).trim();
  return new Error(`${what}: ${token ? text.replaceAll(token, "***") : text}`);
}
