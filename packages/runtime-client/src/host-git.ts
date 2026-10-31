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

// The workspace's `.git` is written by the agent, from inside its container, and these commands run
// on the runner's host, some with a token. Git runs programs its configuration and attributes name
// (filters, textconv, hooks, the file system monitor, a signing program, credential helpers, URL
// rewrites to other transports), so a `.git/config` the agent wrote would run on this machine.
// Switching each key off cannot work, since filters and diff drivers have names the agent picks; so
// git is pointed at a directory of the runner's own instead (`GIT_DIR`), with a configuration made
// here and no hooks or `info/attributes`, which links to the workspace's objects and refs.
// An attribute that names a driver this configuration does not define does nothing. A missing
// object is never fetched (`GIT_NO_LAZY_FETCH`), and git speaks only https, or a path for tests.
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

// What of the workspace's `.git` is linked: what git reads and writes as the repository's contents.
// Nothing else is, so no remote, hook, attribute or other configuration the agent wrote reaches git.
// HEAD is copied, since git takes a linked HEAD for no repository, and the index is named with
// `GIT_INDEX_FILE`.
const LINKED = ["objects", "refs", "packed-refs", "logs", "reftable", "shallow"];
const REDIRECTS = ["commondir", "gitdir"];

// The keys of the workspace's configuration that describe the repository, with plain values only.
const COPIED_KEY =
  /^(core\.(repositoryformatversion|filemode|symlinks|ignorecase|precomposeunicode|logallrefupdates)|extensions\.(objectformat|refstorage))$/;
const PLAIN_VALUE = /^[\w.-]+$/;
// A configuration file that cannot be read by then (a pipe, say) is no repository.
const CONFIG_TIMEOUT_MS = 10_000;

const NOT_A_REPOSITORY = { code: 128, stdout: "", stderr: "fatal: not a git repository" };

const kindOf = async (path: string) => {
  const stat = await lstat(path).catch(() => null);
  if (!stat) return "missing";
  if (stat.isSymbolicLink()) return "link";
  if (stat.isDirectory()) return "directory";
  return stat.isFile() ? "file" : "other";
};

// A plain file's text, or null for anything else: the file is opened without following a link and
// without waiting on a pipe, so what was checked cannot be swapped for one before it is read.
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

// Whether a link is anywhere under `dir`, or `depth` levels down: git writes refs and reflogs
// anywhere under `refs` and `logs`, and objects one folder down in `objects`, through any link.
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

// A `.git` git can be pointed at safely: a folder, its HEAD and configuration plain files, and no
// link where git writes, which it would write through to wherever the link points.
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

// The workspace's configuration reduced to what describes the repository, as a file for git.
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

// The runner's own git directory for the workspace's `.git`: the repository's contents linked, the
// configuration made here, HEAD and the ignore list copied.
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

// Git replaces a file such as `packed-refs` by renaming a new one over it, which replaces the link
// in the runner's directory rather than the workspace's file; such files, and a HEAD git moved, are
// put back by renaming too, which replaces whatever the workspace has there rather than following it.
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

/**
 * `run` for a workspace the agent can write, whose `cwd` is the workspace: git reads a configuration
 * the runner made instead of the workspace's, so nothing the agent planted in `.git` runs on this
 * machine or sends git elsewhere. The index is the workspace's unless `GIT_INDEX_FILE` names another.
 * Fails, without running git, when the workspace's `.git` is not one git can be pointed at safely.
 */
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

/** An error for a failed git command, in git's own words with the token left out. */
export function gitFailure(what: string, output: { stderr: string; stdout: string }, token = "") {
  const text = (output.stderr || output.stdout).trim();
  return new Error(`${what}: ${token ? text.replaceAll(token, "***") : text}`);
}
