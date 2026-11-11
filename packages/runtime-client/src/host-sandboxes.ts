import { SHELL_START } from "./shell-start";
import { withoutRunnerSecrets } from "./runner-secrets";
import { mkdirSync, realpathSync } from "node:fs";
import { lstat, mkdir, realpath, rmdir, symlink } from "node:fs/promises";
import { join, sep } from "node:path";

import type { SandboxPaths } from "@aven/agents/types";
import type { ComputerState, RepoAccess, RunEnvVar } from "@aven/protocol/types";

import { ArtifactStore } from "./artifacts";
import { DirectorySandbox } from "./directory-sandbox";
import { fetchBranch } from "./fetch-branch";
import { forkWorkspace } from "./fork-workspace";
import { cloneRepository, git, isCloned } from "./git-clone";
import { ensureLocalExcludes } from "./local-excludes";
import { envOf, withProjectEnv } from "./project-env";
import { runtimeHome } from "./runtime-home";
import { secretRedactor } from "./secret-redaction";
import { SkillStore } from "./skills";
import { startedOnUse } from "./started-on-use";
import { markTurn } from "./thread-diff";
import { threadProcesses } from "./thread-processes";
import { hasRunningProcesses, sandboxTools } from "./thread-tools";
import { UploadStore } from "./uploads";
import type {
  AcquireOptions,
  HostSandboxConfig,
  ThreadRef,
  ThreadSandbox,
  ThreadWorkspaces,
} from "./types";

export class HostSandboxes implements ThreadWorkspaces {
  readonly artifacts: ArtifactStore;
  readonly uploads: UploadStore;
  readonly skills: SkillStore;
  #config: HostSandboxConfig;
  #home: string;
  #dirs: string[];
  #roots = new Map<string, Promise<string>>();
  #sandboxes = new Map<string, DirectorySandbox>();
  #projectEnv = new Map<string, Readonly<Record<string, string>>>();
  #redactors = new Map<string, ReturnType<typeof secretRedactor>>();

  private constructor(config: HostSandboxConfig) {
    this.#config = config;
    const home = runtimeHome(config.home);
    mkdirSync(home, { recursive: true });
    this.#home = realpathSync(home);
    this.#dirs = (config.dirs ?? []).map((dir) => realpathSync(dir));
    this.artifacts = new ArtifactStore(join(this.#home, "artifacts"));
    this.uploads = new UploadStore(join(this.#home, "uploads"), true);
    this.skills = new SkillStore(join(this.#home, "skills"), true);
  }

  static async start(config: HostSandboxConfig = {}) {
    const run = config.git ?? git;
    const version = await run(["--version"], { cwd: process.cwd() });
    if (version.code !== 0) {
      throw new Error("A runner that works on this machine needs git on its PATH");
    }
    return new HostSandboxes(config);
  }

  get dirs() {
    return [...this.#dirs];
  }

  #workspaceDir(threadId: string) {
    return join(this.#home, "workspaces", threadId);
  }

  paths(threadId: string): SandboxPaths {
    return {
      workspace: this.#workspaceDir(threadId),
      uploads: join(this.uploads.root, threadId),
      skills: join(this.skills.root, "threads", threadId),
    };
  }

  #workspace(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    folder?: () => Promise<string | null>,
  ) {
    const known = this.#roots.get(thread.id);
    if (known) return known;
    const preparing = this.#fill(thread, repo, folder);
    this.#roots.set(thread.id, preparing);
    preparing.catch(() => this.#roots.delete(thread.id));
    return preparing;
  }

  async #fill(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    folder?: () => Promise<string | null>,
  ) {
    const dir = this.#workspaceDir(thread.id);
    await mkdir(dir, { recursive: true });
    const directory = await folder?.();
    if (directory) return this.#fillFromFolder(thread, dir, directory);
    const root = await realpath(dir);
    if (!repo || (await isCloned(root))) return root;
    const run = this.#config.git ?? git;
    const parent = thread.forkOf ? this.#workspaceDir(thread.forkOf) : undefined;
    if (parent && (await isCloned(parent))) {
      await forkWorkspace(await realpath(parent), root, thread.id, run);
    } else {
      await cloneRepository(root, thread.id, await repo(), run);
    }
    await ensureLocalExcludes(root).catch((error: unknown) => {
      console.warn(`Could not keep package stores out of git in ${root}:`, error);
    });
    return root;
  }

  async #fillFromFolder(thread: ThreadRef, dir: string, directory: string) {
    const run = this.#config.git ?? git;
    const source = await realpath(directory).catch(() => {
      throw new Error(`The folder ${directory} is not on this machine`);
    });
    if (!this.#dirs.some((served) => source === served || source.startsWith(served + sep))) {
      throw new Error(`This runner does not serve ${directory}`);
    }
    const inside = await run(["rev-parse", "--is-inside-work-tree"], { cwd: source });
    if (inside.code !== 0) {
      if (thread.forkOf) {
        throw new Error(
          `${directory} is not a git repository, so a fork of this thread would work on the same files: put the folder under git to fork it`,
        );
      }
      if ((await lstat(dir)).isSymbolicLink()) return dir;
      await rmdir(dir);
      await symlink(source, dir);
      return dir;
    }
    const root = await realpath(dir);
    if (await isCloned(root)) return root;
    const parent = thread.forkOf ? this.#workspaceDir(thread.forkOf) : undefined;
    if (parent && (await isCloned(parent))) {
      await forkWorkspace(await realpath(parent), root, thread.id, run);
    } else {
      const branch = await run(["symbolic-ref", "--short", "-q", "HEAD"], { cwd: source });
      if (branch.code !== 0 || !branch.stdout.trim()) {
        throw new Error(`Check out a branch in ${directory} first: it is on no branch`);
      }
      await cloneRepository(
        root,
        thread.id,
        { cloneUrl: source, defaultBranch: branch.stdout.trim(), token: "local" },
        run,
      );
    }
    await ensureLocalExcludes(root).catch((error: unknown) => {
      console.warn(`Could not keep package stores out of git in ${root}:`, error);
    });
    return root;
  }

  async acquire(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    { lazy = false, folder }: AcquireOptions = {},
  ): Promise<ThreadSandbox> {
    const start = async () => {
      await this.#workspace(thread, repo, folder);
    };
    if (!(lazy && repo)) await start();
    await mkdir(this.#workspaceDir(thread.id), { recursive: true });
    const sandbox = new DirectorySandbox(thread.id, this.#workspaceDir(thread.id));
    this.#sandboxes.set(thread.id, sandbox);
    const runtime = withProjectEnv(startedOnUse(sandbox, start), () =>
      this.#projectEnv.get(thread.id),
    );
    return {
      tools: sandboxTools(runtime, { id: thread.id, artifacts: this.artifacts }),
      runtime,
      hasRunningProcesses: () => hasRunningProcesses(runtime),
      processes: threadProcesses(
        runtime,
        () => true,
        () => this.#redactors.get(thread.id),
      ),
      start,
      state: () => this.computerState(thread.id),
    };
  }

  computerState(_threadId: string): ComputerState {
    return "awake";
  }

  desktop() {
    return undefined;
  }

  shell(threadId: string, _sessionId: string) {
    const root = this.#workspaceDir(threadId);
    const project = this.#projectEnv.get(threadId) ?? {};
    return {
      argv: ["bash", "-c", SHELL_START],
      env: {
        ...withoutRunnerSecrets(process.env),
        ...project,
        AVEN_THREAD_DIR: root,
        TERM: "xterm-256color",
      } as Record<string, string>,
      hangup: ["true"],
    };
  }

  async workspace(threadId: string) {
    const dir = this.#workspaceDir(threadId);
    if (
      (await isCloned(dir)) ||
      (await lstat(dir).then(
        (s) => s.isSymbolicLink(),
        () => false,
      ))
    ) {
      return realpath(dir);
    }
    return undefined;
  }

  running() {
    return this.#sandboxes.size;
  }

  async markTurn(threadId: string) {
    const root = await this.workspace(threadId);
    return root ? markTurn(root).catch(() => false) : false;
  }

  async fetchBranch(threadId: string, access: RepoAccess, branch?: string) {
    const root = await this.workspace(threadId);
    if (!root) throw new Error("The thread has no workspace yet");
    return fetchBranch(root, access, branch, this.#config.git ?? git);
  }

  async release(threadId: string) {
    await this.#sandboxes.get(threadId)?.dispose();
    this.#sandboxes.delete(threadId);
    this.#roots.delete(threadId);
    this.#projectEnv.delete(threadId);
    this.#redactors.delete(threadId);
  }

  setProjectEnv(threadId: string, env: readonly RunEnvVar[] | undefined) {
    if (env?.length) this.#projectEnv.set(threadId, envOf(env));
    else this.#projectEnv.delete(threadId);
    const redact = secretRedactor(env);
    if (redact) this.#redactors.set(threadId, redact);
    else this.#redactors.delete(threadId);
  }

  async dispose() {
    await Promise.all(
      [...this.#sandboxes.keys()].map((id) =>
        this.release(id).catch((error: unknown) => {
          console.error(`Could not stop thread ${id}:`, error);
        }),
      ),
    );
  }
}
