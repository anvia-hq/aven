import { copyFile, lstat, mkdir, mkdtemp, readdir, rename, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { git, type Git } from "./git-clone";

// The workspace's `.git` is written by the agent, from inside its container, and these commands run
// on the runner's host, some with a token. Git runs programs its configuration and attributes name
// (filters, textconv, hooks, the file system monitor, a signing program, credential helpers, URL
// rewrites to other transports), so a `.git/config` the agent wrote would run on this machine.
// Switching each key off cannot work, since filters and diff drivers have names the agent picks; so
// git is pointed at a directory of the runner's own instead (`GIT_DIR`), with a configuration made
// here and no hooks or `info/attributes`, which links to the workspace's objects, refs and HEAD.
// An attribute that names a driver this configuration does not define does nothing.
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
];
const SAFE_ENV = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };

// What of the workspace's `.git` is not linked: its configuration, hooks and attributes, the index
// (named with `GIT_INDEX_FILE`), HEAD (copied, since git takes a linked HEAD for no repository), and
// the files that would send git to another directory's configuration, which a clone the runner made
// never has.
const NOT_LINKED = new Set(["config", "config.worktree", "hooks", "info", "index", "HEAD"]);
const REDIRECTS = new Set(["commondir", "gitdir"]);

// The keys of the workspace's configuration that describe the repository rather than tell git to
// run something, with plain values only, so no line can open a section of its own.
const COPIED_KEY =
  /^(core\.(repositoryformatversion|filemode|symlinks|ignorecase|precomposeunicode|logallrefupdates)|extensions\.[a-z]+)$/;
const PLAIN_VALUE = /^[\w.-]+$/;

const NOT_A_REPOSITORY = { code: 128, stdout: "", stderr: "fatal: not a git repository" };

async function isPlainDirectory(path: string) {
  const stat = await lstat(path).catch(() => null);
  return stat?.isDirectory() ?? false;
}

// The workspace's configuration reduced to what describes the repository, as a file for git.
async function safeConfig(repo: string, run: Git) {
  const read = await run(["config", "--file", join(repo, "config"), "--list"], {
    cwd: tmpdir(),
    env: SAFE_ENV,
  });
  const sections = new Map<string, string[]>([["core", ["bare = false"]]]);
  for (const line of read.code === 0 ? read.stdout.split("\n") : []) {
    const at = line.indexOf("=");
    const key = line.slice(0, at);
    const value = line.slice(at + 1);
    if (at < 0 || !COPIED_KEY.test(key) || !PLAIN_VALUE.test(value)) continue;
    const [section, name] = [key.slice(0, key.indexOf(".")), key.slice(key.indexOf(".") + 1)];
    if (section === "core" && name === "bare") continue;
    const lines = sections.get(section) ?? [];
    lines.push(`${name} = ${value}`);
    sections.set(section, lines);
  }
  return [...sections].map(([name, lines]) => `[${name}]\n\t${lines.join("\n\t")}\n`).join("");
}

// The runner's own git directory for the workspace's `.git`: the workspace's entries linked, the
// configuration made here and its ignore list copied. Null when `.git` has no HEAD or could send git
// elsewhere.
async function shadowOf(repo: string, run: Git) {
  const entries = await readdir(repo);
  if (entries.some((entry) => REDIRECTS.has(entry))) return null;
  const head = await Bun.file(join(repo, "HEAD"))
    .text()
    .catch(() => null);
  if (head === null) return null;
  const shadow = await mkdtemp(join(tmpdir(), "aven-git-"));
  const linked = entries.filter((entry) => !NOT_LINKED.has(entry));
  try {
    await Promise.all(linked.map((entry) => symlink(join(repo, entry), join(shadow, entry))));
    await mkdir(join(shadow, "info"));
    await copyFile(join(repo, "info", "exclude"), join(shadow, "info", "exclude")).catch(() => {});
    await Bun.write(join(shadow, "config"), await safeConfig(repo, run));
    await Bun.write(join(shadow, "HEAD"), head);
  } catch (error) {
    await rm(shadow, { recursive: true, force: true });
    throw error;
  }
  return { shadow, linked, head };
}

// Git replaces a file such as `packed-refs` by renaming a new one over it, which replaces the link
// in the runner's directory rather than the workspace's file; such files, and a HEAD git moved, are
// put back where they belong.
async function returnReplaced(shadow: string, linked: string[], repo: string, head: string) {
  for (const entry of linked) {
    const stat = await lstat(join(shadow, entry)).catch(() => null);
    if (stat && !stat.isSymbolicLink()) await rename(join(shadow, entry), join(repo, entry));
  }
  const moved = await Bun.file(join(shadow, "HEAD")).text();
  if (moved !== head) await Bun.write(join(repo, "HEAD"), moved);
}

/**
 * `run` for a workspace the agent can write, whose `cwd` is the workspace: git reads a configuration
 * the runner made instead of the workspace's, so nothing the agent planted in `.git` runs on this
 * machine. The index is the workspace's unless `GIT_INDEX_FILE` names another. Fails, without
 * running git, when the workspace has no `.git` folder of its own.
 */
export function hostGit(run: Git = git): Git {
  return async (args, options) => {
    const repo = join(options.cwd, ".git");
    if (!(await isPlainDirectory(repo))) return NOT_A_REPOSITORY;
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
