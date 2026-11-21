import { SHELL_START } from "./sandboxes/shell-start";
import { withoutRunnerSecrets } from "@aven/agent-backend/runner-secrets";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { lstat, mkdir, realpath, rename, rmdir, symlink } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

import type { SandboxPaths } from "@aven/agents/types";
import type { ComputerState, RepoAccess, RunEnvVar, RunGithub } from "@aven/protocol/types";

import { ArtifactStore } from "./files/artifacts";
import { DirectorySandbox } from "./sandboxes/directory-sandbox";
import { fetchBranch } from "./git/fetch-branch";
import { forkWorkspace } from "./git/fork-workspace";
import { cloneRepository, git, isCloned } from "./git/git-clone";
import { cloneRepositoryFolder, refreshRepositoryFolder } from "./git/repository-clone";
import { ensureLocalExcludes } from "./git/local-excludes";
import { githubRunEnv } from "./security/github-signin";
import { envOf, withProjectEnv } from "./security/project-env";
import { runtimeHome } from "./runtime-home";
import { secretRedactor } from "./security/secret-redaction";
import { SkillStore } from "./files/skills";
import { startedOnUse } from "./sandboxes/started-on-use";
import { markTurn } from "./git/thread-diff";
import { threadProcesses } from "./thread-processes";
import { hasRunningProcesses, sandboxTools } from "./tools/thread-tools";
import { UploadStore } from "./files/uploads";
import type {
  AcquireOptions,
  HostSandboxConfig,
  ThreadRef,
  ThreadSandbox,
  ThreadWorkspaces,
} from "./types";

type HostThreadState = {
  root?: Promise<string>;
  sandbox?: DirectorySandbox;
  projectEnv?: Readonly<Record<string, string>>;
  projectVars?: readonly RunEnvVar[];
  githubEnv?: Readonly<Record<string, string>>;
  githubToken?: string;
  redactor?: ReturnType<typeof secretRedactor>;
  claim?: Promise<void>;
};

export class HostSandboxes implements ThreadWorkspaces {
  readonly artifacts: ArtifactStore;
  readonly uploads: UploadStore;
  readonly skills: SkillStore;
  #config: HostSandboxConfig;
  #home: string;
  #dirs: string[];
  #reposDir: string;
  #threads = new Map<string, HostThreadState>();

  private constructor(config: HostSandboxConfig) {
    this.#config = config;
    const home = runtimeHome(config.home);
    mkdirSync(home, { recursive: true });
    this.#home = realpathSync(home);
    this.#reposDir = join(this.#home, "repos");
    mkdirSync(this.#reposDir, { recursive: true });
    const served = (config.dirs ?? []).map((dir) => realpathSync(dir));
    const repos = realpathSync(this.#reposDir);
    this.#dirs = served.includes(repos) ? served : [...served, repos];
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

  cloneRepository(repository: string) {
    return cloneRepositoryFolder(this.#reposDir, repository, this.#config.git ?? git);
  }

  get dirs() {
    return [...this.#dirs];
  }

  #botDir(id: string) {
    return join(this.#home, "bots", id);
  }

  #workspaceDir(threadId: string) {
    const bot = this.#botDir(threadId);
    return existsSync(bot) ? bot : join(this.#home, "workspaces", threadId);
  }

  #thread(id: string): HostThreadState {
    let state = this.#threads.get(id);

    if (!state) {
      state = {};
      this.#threads.set(id, state);
    }

    return state;
  }

  #claimBotFolder(id: string) {
    const state = this.#thread(id);

    if (state.claim) return state.claim;

    const moving = this.#moveBotFolder(id);
    state.claim = moving;
    moving.catch(() => {
      if (state.claim === moving) state.claim = undefined;
    });
    return moving;
  }

  async #moveBotFolder(id: string) {
    const folder = this.#botDir(id);

    if (existsSync(folder)) return;

    const legacy = join(this.#home, "workspaces", id);
    const state = this.#threads.get(id);

    if (state) state.root = undefined;

    await mkdir(dirname(folder), { recursive: true });

    if (!existsSync(legacy)) {
      await mkdir(folder, { recursive: true });
      return;
    }

    try {
      await rename(legacy, folder);
    } catch (error) {
      if (!existsSync(folder)) throw error;
    }
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
    const state = this.#thread(thread.id);

    if (state.root) return state.root;

    const preparing = this.#fill(thread, repo, folder);
    state.root = preparing;
    preparing.catch(() => {
      if (state.root === preparing) state.root = undefined;
    });
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

    if (source.startsWith(this.#reposDir + sep)) await refreshRepositoryFolder(source, run);

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
    if (thread.bot) await this.#claimBotFolder(thread.id);

    const start = async () => {
      await this.#workspace(thread, repo, folder);
    };

    if (!(lazy && repo)) await start();

    const dir = this.#workspaceDir(thread.id);
    await mkdir(dir, { recursive: true });
    const state = this.#thread(thread.id);
    const existing = state.sandbox;
    let sandbox: DirectorySandbox;

    if (existing && existing.root === dir) {
      sandbox = existing;
    } else {
      if (existing) await existing.dispose();

      sandbox = new DirectorySandbox(thread.id, dir);
      state.sandbox = sandbox;
    }

    const runtime = withProjectEnv(startedOnUse(sandbox, start), () => this.#envOf(thread.id));
    return {
      tools: sandboxTools(runtime, { id: thread.id, artifacts: this.artifacts }),
      runtime,
      hasRunningProcesses: () => hasRunningProcesses(runtime),
      processes: threadProcesses(
        runtime,
        () => true,
        () => this.#threads.get(thread.id)?.redactor,
      ),
      start,
      state: () => this.computerState(thread.id),
    };
  }

  computerState(_threadId: string): ComputerState {
    return "awake";
  }

  shell(threadId: string, _sessionId: string) {
    const root = this.#workspaceDir(threadId);
    const project = this.#envOf(threadId);
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
    let count = 0;
    for (const state of this.#threads.values()) {
      if (state.sandbox) count++;
    }
    return count;
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
    const state = this.#threads.get(threadId);
    this.#threads.delete(threadId);
    await state?.sandbox?.dispose();
  }

  setProjectEnv(threadId: string, env: readonly RunEnvVar[] | undefined) {
    const state = this.#thread(threadId);
    state.projectEnv = env?.length ? envOf(env) : undefined;
    state.projectVars = env?.length ? env : undefined;
    this.#redact(threadId);
  }

  async signInGithub(threadId: string, github: RunGithub | undefined) {
    const state = this.#thread(threadId);
    state.githubEnv = undefined;
    state.githubToken = undefined;
    this.#redact(threadId);

    if (!github) return;

    const configDir = join(this.#home, "gh-config", threadId);
    await mkdir(configDir, { recursive: true });
    state.githubEnv = githubRunEnv(github, configDir);
    state.githubToken = github.token;
    this.#redact(threadId);
  }

  #envOf(threadId: string): Record<string, string> {
    const state = this.#threads.get(threadId);
    return Object.assign({}, state?.projectEnv, state?.githubEnv);
  }

  #redact(threadId: string) {
    const state = this.#threads.get(threadId);

    if (!state) return;

    const variables = Array.from(state.projectVars ?? []);

    if (state.githubToken !== undefined) {
      variables.push({ name: "GH_TOKEN", value: state.githubToken, secret: true });
    }

    state.redactor = secretRedactor(variables);
  }

  async dispose() {
    await Promise.all(
      [...this.#threads.keys()].map((id) =>
        this.release(id).catch((error: unknown) => {
          console.error(`Could not stop thread ${id}:`, error);
        }),
      ),
    );
  }
}
