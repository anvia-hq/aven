import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createDesktopTools } from "@anvia/sandbox";
import { RemoteSandboxHub } from "@anvia/sandbox/remote";
import { UPLOADS_DIR } from "@aven/agents/attachments";
import { WORKSPACE_DIR } from "@aven/agents/sandbox-tools";
import { SKILLS_DIR } from "@aven/agents/skills";

import { ArtifactStore } from "./artifacts";
import { homeRepairArgs } from "./container-home";
import { RESUME_SCRIPT, containerBaseArgs, hostUser, scriptState } from "./environment-setup";
import { BROWSER_PROFILE_DIR, BrowserProfiles } from "./browser-profiles";
import { ArchivedCleanup } from "./archived-cleanup";
import { Leftovers } from "./leftovers";
import { Environments } from "./environments";
import { git, isCloned } from "./git-clone";
import { containerReachesHost, reachAdvice } from "./host-reach";
import { signInCommand } from "./github-signin";
import { startIdentityRelay } from "./identity-relay";
import { identitySignInCommand, isLoopback, originOf } from "./identity-signin";
import { envOf, withProjectEnv } from "./project-env";
import { ensureLocalExcludes } from "./local-excludes";
import { runCommand } from "./run-command";
import { preflight } from "./sandbox-preflight";
import { secretRedactor } from "./secret-redaction";
import { SkillStore } from "./skills";
import type { SnapshotStore } from "./snapshots";
import { startedOnUse } from "./started-on-use";
import { terminalShell } from "./terminal-shell";
import { threadProcesses } from "./thread-processes";
import { hasRunningProcesses, sandboxTools } from "./thread-tools";
import { UploadStore } from "./uploads";
import type {
  ComputerState,
  DockerRemoveParams,
  RepoAccess,
  RunEnvVar,
  RunGithub,
  RunIdentityCredential,
} from "@aven/protocol/types";
import type {
  AcquireOptions,
  ContainerBase,
  DockerRun,
  HostCommands,
  IdentityRelay,
  SandboxConfig,
  ThreadRef,
  ThreadSandbox,
  ThreadWorkspaces,
} from "./types";

export const runtimeHome = (home?: string) => home ?? join(homedir(), ".aven", "runtime");
export const journalPathIn = (home?: string) => join(runtimeHome(home), "runs.db");

export const runnerLabel = (home?: string) =>
  createHash("sha256")
    .update(resolve(runtimeHome(home)))
    .digest("hex")
    .slice(0, 16);

type Docker = DockerRun;

const DEFAULT_CONNECT_TIMEOUT_MS = 90_000;
const DEFAULT_REACH_CHECK_AFTER_MS = 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ARCHIVED_KEEP_DAYS = 1;
const DEFAULT_BROWSER_PROFILE_KEEP_DAYS = 90;
const FIRST_SWEEP_MS = 60_000;
const SWEEP_MS = 60 * 60 * 1000;
const CONNECT_POLL_MS = 50;
const RESUME_TIMEOUT_MS = 10_000;
const SIGN_IN_TIMEOUT_MS = 30_000;

const docker: Docker = (args, options) => runCommand(["docker", ...args], options);

type DockerRunInput = Omit<ContainerBase, "label"> & {
  threadId: string;
  image: string;
  root: string;
  uploads: string;
  skills: string;
  profile?: string;
  host: string;
  hubPort: number;
  token: string;
  user?: string;
};

function profileArgs(profile: string | undefined) {
  if (!profile) return [];
  return [
    "-v",
    `${profile}:${BROWSER_PROFILE_DIR}`,
    "-e",
    `ANVIA_BROWSER_PROFILE=${BROWSER_PROFILE_DIR}`,
  ];
}

export function dockerRunArgs(input: DockerRunInput) {
  const args = containerBaseArgs(
    { ...input, label: `aven.thread=${input.threadId}` },
    {
      beforeLimits: ["--add-host", `${input.host}:host-gateway`],
      afterLimits: [
        "--security-opt",
        "no-new-privileges",
        "-v",
        `${input.root}:${WORKSPACE_DIR}`,
        "-v",
        `${input.uploads}:${UPLOADS_DIR}:ro`,
        "-v",
        `${input.skills}:${SKILLS_DIR}:ro`,
        ...profileArgs(input.profile),
        "-e",
        `ANVIA_CONTROL_URL=ws://${input.host}:${input.hubPort}/daemon`,
        "-e",
        `ANVIA_SANDBOX_TOKEN=${input.token}`,
        "-e",
        `ANVIA_SANDBOX_WORKDIR=${WORKSPACE_DIR}`,
      ],
    },
  );
  if (input.user) args.push("--user", input.user);
  args.push(input.image);
  return args;
}

export class Sandboxes implements ThreadWorkspaces {
  readonly artifacts: ArtifactStore;
  readonly uploads: UploadStore;
  readonly skills: SkillStore;
  readonly snapshots: SnapshotStore;
  #config: SandboxConfig;
  #containers: { runner: string; memoryMb: number; cpus: number; pidsLimit: number };
  #host: string;
  #environments: Environments;
  #archived: ArchivedCleanup;
  #profiles: BrowserProfiles;
  #waking = new Map<string, number>();
  #leftovers: Leftovers;
  #sweeper: Timer | undefined;
  #hub: RemoteSandboxHub;
  #identityRelay: IdentityRelay | undefined;
  #port: number;
  #tokens: Map<string, string>;
  #run: Docker;
  #running = new Set<string>();
  #roots = new Map<string, Promise<string>>();
  #starting = new Map<string, Promise<void>>();
  #projectEnv = new Map<string, Readonly<Record<string, string>>>();
  #redactors = new Map<string, ReturnType<typeof secretRedactor>>();

  private constructor(
    config: SandboxConfig,
    commands: HostCommands,
    hub: RemoteSandboxHub,
    port: number,
    tokens: Map<string, string>,
  ) {
    this.#config = config;
    this.#containers = {
      runner: runnerLabel(config.home),
      memoryMb: config.memoryMb ?? 8192,
      cpus: config.cpus ?? 4,
      pidsLimit: config.pidsLimit ?? 1024,
    };
    this.#host = config.hostName ?? "host.docker.internal";
    this.artifacts = new ArtifactStore(join(runtimeHome(config.home), "artifacts"));
    this.uploads = new UploadStore(join(runtimeHome(config.home), "uploads"));
    this.skills = new SkillStore(join(runtimeHome(config.home), "skills"));
    this.#environments = new Environments({
      image: config.image,
      platform: config.platform,
      runtime: config.runtime,
      ...this.#containers,
      home: runtimeHome(config.home),
      docker: commands.docker,
      git: commands.git,
    });
    this.snapshots = this.#environments.snapshots;
    this.#archived = new ArchivedCleanup({
      home: runtimeHome(config.home),
      keepMs: (config.archivedKeepDays ?? DEFAULT_ARCHIVED_KEEP_DAYS) * DAY_MS,
      docker: commands.docker,
      inUse: (threadId) =>
        this.#running.has(threadId) || this.#starting.has(threadId) || this.#roots.has(threadId),
    });
    this.#profiles = new BrowserProfiles({
      home: runtimeHome(config.home),
      keepMs: (config.browserProfileKeepDays ?? DEFAULT_BROWSER_PROFILE_KEEP_DAYS) * DAY_MS,
    });
    this.#leftovers = new Leftovers({
      docker: commands.docker,
      runner: this.#containers.runner,
      image: config.image,
      home: runtimeHome(config.home),
      inUse: (threadId) =>
        this.#running.has(threadId) || this.#starting.has(threadId) || this.#roots.has(threadId),
    });
    this.#hub = hub;
    this.#port = port;
    this.#tokens = tokens;
    this.#run = commands.docker;
  }

  static async start(config: SandboxConfig) {
    const commands = { docker: config.docker ?? docker, git: config.git ?? git };
    await preflight(config, commands);
    const tokens = new Map<string, string>();
    const hub = new RemoteSandboxHub({
      authorize: (token) => {
        const sandboxId = tokens.get(token);
        return sandboxId ? { sandboxId } : null;
      },
      connectTimeoutMs: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    });
    const { port } = await hub.listen({ host: "0.0.0.0", port: 0, path: "/daemon" });
    const sandboxes = new Sandboxes(config, commands, hub, port, tokens);
    await sandboxes.#removeStale();
    sandboxes.#startSweeping();
    return sandboxes;
  }

  #startSweeping() {
    const sweep = () =>
      void this.#archived
        .sweep()
        .then((removed) => Promise.all(removed.map((id) => this.#profiles.forget(id))))
        .then(() => this.#profiles.sweep())
        .catch((error: unknown) => {
          console.warn("Could not clean up archived threads:", error);
        });
    setTimeout(sweep, FIRST_SWEEP_MS).unref();
    this.#sweeper = setInterval(sweep, SWEEP_MS);
    this.#sweeper.unref();
  }

  leftovers() {
    return this.#leftovers.list();
  }

  removeLeftovers(request: DockerRemoveParams) {
    return this.#leftovers.remove(request);
  }

  async putAway(threadId: string) {
    await this.#archived.mark(threadId);
  }

  async acquire(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    { lazy = false }: AcquireOptions = {},
  ): Promise<ThreadSandbox> {
    await this.#archived.clear(thread.id);
    await this.#profiles.remember(thread);
    let preparing: Promise<void> | undefined;
    const prepare = async () => {
      const root = await this.#workspace(thread, repo);
      await this.#ensure(thread.id, root);
    };
    const startLazily = () => {
      preparing ??= prepare().catch((error: unknown) => {
        preparing = undefined;
        throw error;
      });
      return preparing;
    };
    const eager = !(lazy && repo);
    const root = eager ? await this.#workspace(thread, repo) : undefined;
    const begin = eager
      ? () =>
          this.#ensure(thread.id, root!).then(() => (repo ? undefined : this.#noteUsed(thread.id)))
      : startLazily;
    const start = async () => {
      this.#waking.set(thread.id, (this.#waking.get(thread.id) ?? 0) + 1);
      try {
        await begin();
      } finally {
        const left = (this.#waking.get(thread.id) ?? 1) - 1;
        if (left > 0) this.#waking.set(thread.id, left);
        else this.#waking.delete(thread.id);
      }
    };
    const upWhenNeeded = <T extends object>(sandbox: T) =>
      repo && eager ? sandbox : startedOnUse(sandbox, start);
    if (repo && eager) await start();
    if (!repo && (await this.#usedBefore(thread.id))) void start().catch(() => undefined);
    const runtime = withProjectEnv(
      upWhenNeeded(this.#hub.runtime(thread.id, { workdir: WORKSPACE_DIR })),
      () => this.#projectEnv.get(thread.id),
    );
    return {
      tools: [
        ...sandboxTools(runtime, { id: thread.id, artifacts: this.artifacts }),
        ...createDesktopTools({ sandbox: upWhenNeeded(this.#hub.desktop(thread.id)) }),
      ],
      hasRunningProcesses: async () =>
        this.#hub.isConnected(thread.id) && (await hasRunningProcesses(runtime)),
      processes: threadProcesses(
        runtime,
        () => this.#hub.isConnected(thread.id),
        () => this.#redactors.get(thread.id),
      ),
      start,
      state: () => this.computerState(thread.id),
    };
  }

  computerState(threadId: string): ComputerState {
    if (this.#running.has(threadId) && this.#hub.isConnected(threadId)) return "awake";
    return this.#starting.has(threadId) || this.#waking.has(threadId) ? "waking" : "asleep";
  }

  desktop(threadId: string) {
    return this.#hub.isConnected(threadId) ? this.#hub.desktop(threadId) : undefined;
  }

  shell(threadId: string, sessionId: string) {
    if (!/^[\w-]+$/.test(sessionId)) throw new Error("Invalid terminal id");
    if (!this.#running.has(threadId) || !this.#hub.isConnected(threadId)) return undefined;
    return terminalShell({
      container: this.#name(threadId),
      sessionId,
      project: this.projectEnv(threadId) ?? {},
    });
  }

  projectEnv(threadId: string) {
    return this.#projectEnv.get(threadId);
  }

  async workspace(threadId: string) {
    const dir = this.#workspaceDir(threadId);
    return (await isCloned(dir)) ? realpath(dir) : undefined;
  }

  running() {
    return this.#running.size;
  }

  async release(threadId: string) {
    await this.#starting.get(threadId)?.catch(() => undefined);
    this.#roots.delete(threadId);
    this.#projectEnv.delete(threadId);
    this.#redactors.delete(threadId);
    await this.#teardown(threadId);
  }

  async #teardown(threadId: string) {
    this.#running.delete(threadId);
    this.#dropTokens(threadId);
    this.#hub.forget(threadId);
    await this.#run(["rm", "-f", this.#name(threadId)]);
    this.#profiles.release(threadId);
  }

  async dispose() {
    clearInterval(this.#sweeper);
    const threads = new Set([...this.#running, ...this.#starting.keys()]);
    const released = [...threads].map((id) =>
      this.release(id).catch((error: unknown) => {
        console.error(`Could not remove the sandbox of thread ${id}:`, error);
      }),
    );
    await Promise.all(released);
    this.#identityRelay?.stop();
    await this.#hub.close();
  }

  #workspace(thread: ThreadRef, repo?: () => Promise<RepoAccess>) {
    const known = this.#roots.get(thread.id);
    if (known) return known;
    const preparing = this.#prepare(thread, repo);
    this.#roots.set(thread.id, preparing);
    preparing.catch(() => this.#roots.delete(thread.id));
    return preparing;
  }

  async #prepare(thread: ThreadRef, repo?: () => Promise<RepoAccess>) {
    if (!repo) return this.#emptyWorkspace(thread.id);
    const root = await this.#fillWorkspace(thread, repo);
    await ensureLocalExcludes(root).catch((error: unknown) => {
      console.warn(`Could not keep package stores out of git in ${root}:`, error);
    });
    return root;
  }

  async #emptyWorkspace(threadId: string) {
    const dir = this.#workspaceDir(threadId);
    await mkdir(dir, { recursive: true });
    return realpath(dir);
  }

  async #fillWorkspace(thread: ThreadRef, repo: () => Promise<RepoAccess>) {
    const dir = this.#workspaceDir(thread.id);
    await mkdir(dir, { recursive: true });
    const root = await realpath(dir);
    if (await isCloned(root)) return root;
    if (thread.forkOf) {
      const parent = this.#workspaceDir(thread.forkOf);
      if (await isCloned(parent)) {
        await this.#environments.fork(thread, await realpath(parent), thread.forkOf, root);
        return root;
      }
    }
    await this.#environments.fill(thread, root, await repo());
    return root;
  }

  #usedFile(id: string) {
    return join(runtimeHome(this.#config.home), "bot-computers", id);
  }

  async #usedBefore(id: string) {
    return access(this.#usedFile(id)).then(
      () => true,
      () => false,
    );
  }

  async #noteUsed(id: string) {
    await mkdir(join(runtimeHome(this.#config.home), "bot-computers"), { recursive: true });
    await writeFile(this.#usedFile(id), "").catch(() => undefined);
  }

  setProjectEnv(threadId: string, env: readonly RunEnvVar[] | undefined) {
    if (env?.length) this.#projectEnv.set(threadId, envOf(env));
    else this.#projectEnv.delete(threadId);
    const redact = secretRedactor(env);
    if (redact) this.#redactors.set(threadId, redact);
    else this.#redactors.delete(threadId);
  }

  signInGithub(threadId: string, github: RunGithub | undefined) {
    return this.#signIn(threadId, "GitHub", signInCommand(github));
  }

  signInIdentity(
    threadId: string,
    identity: RunIdentityCredential | undefined,
    controlPlane: string,
  ) {
    return this.#signIn(
      threadId,
      "identity",
      identitySignInCommand(identity, this.#identityOrigin(identity, controlPlane)),
    );
  }

  #identityOrigin(identity: RunIdentityCredential | undefined, controlPlane: string) {
    if (!identity || !isLoopback(controlPlane)) return originOf(controlPlane);
    this.#identityRelay ??= startIdentityRelay(controlPlane);
    return `http://${this.#host}:${this.#identityRelay.port}`;
  }

  async #signIn(
    threadId: string,
    what: string,
    { script, env }: { script: string; env: Record<string, string> },
  ) {
    const result = await this.#hub
      .runtime(threadId, { workdir: WORKSPACE_DIR })
      .exec({ command: "sh", args: ["-c", script], env, timeoutMs: SIGN_IN_TIMEOUT_MS });
    if (result.status !== "exited" || result.exitCode !== 0) {
      throw new Error(
        `Could not sign in to ${what}: ${new TextDecoder().decode(result.stderr).trim()}`,
      );
    }
  }

  async saveEnvironment(thread: ThreadRef, access: RepoAccess) {
    const root = await this.workspace(thread.id);
    if (!root) throw new Error("The thread has no workspace yet");
    return this.#environments.save(thread, root, access);
  }

  #workspaceDir(threadId: string) {
    return join(runtimeHome(this.#config.home), "workspaces", threadId);
  }

  #name(threadId: string) {
    return `aven-sandbox-${threadId}`;
  }

  async #removeStale() {
    const { stdout } = await this.#run([
      "ps",
      "-a",
      "--filter",
      "label=aven.sandbox",
      "--format",
      '{{.ID}} {{.Label "aven.runner"}}',
    ]);
    const ids = stdout
      .split("\n")
      .map((line) => line.trim().split(" "))
      .filter(([id, runner]) => id && (!runner || runner === this.#containers.runner))
      .map(([id]) => id as string);
    if (ids.length > 0) await this.#run(["rm", "-f", ...ids]);
  }

  #ensure(threadId: string, root: string) {
    if (this.#running.has(threadId) && this.#hub.isConnected(threadId)) return Promise.resolve();
    let starting = this.#starting.get(threadId);
    if (!starting) {
      starting = this.#startContainer(threadId, root).finally(() =>
        this.#starting.delete(threadId),
      );
      this.#starting.set(threadId, starting);
    }
    return starting;
  }

  async #startContainer(threadId: string, root: string) {
    const name = this.#name(threadId);
    await this.#run(["rm", "-f", name]);
    const image = await this.#environments.imageOf(threadId);
    const uploads = await this.uploads.dir(threadId);
    const skills = await this.skills.dir(threadId);
    const token = randomBytes(24).toString("base64url");
    this.#dropTokens(threadId);
    this.#tokens.set(token, threadId);
    const user = hostUser();
    try {
      const profile = await this.#profiles.lease(threadId);
      const args = dockerRunArgs({
        name,
        threadId,
        image,
        root,
        uploads,
        skills,
        profile: profile?.dir,
        host: this.#host,
        hubPort: this.#port,
        token,
        ...this.#containers,
        platform: this.#config.platform,
        runtime: this.#config.runtime,
        user,
      });
      const started = await this.#run(args);
      if (started.code !== 0) {
        throw new Error(`Could not start the sandbox: ${started.stderr.trim() || started.stdout}`);
      }
    } catch (error) {
      this.#tokens.delete(token);
      this.#profiles.release(threadId);
      throw error;
    }
    this.#running.add(threadId);
    if (user) await this.#repairHome(name, user);
    await this.#awaitDaemon(threadId);
    await this.#resume(name, root);
  }

  async #repairHome(name: string, user: string) {
    const repaired = await this.#run(homeRepairArgs(name, user));
    if (repaired.code !== 0) {
      console.warn(
        `Could not repair the home of ${name} (exit ${repaired.code}):`,
        repaired.stderr.trim(),
      );
    }
  }

  async #resume(name: string, root: string) {
    if ((await scriptState(root, RESUME_SCRIPT)) !== "ready") return;
    const ran = await this.#run(["exec", "-w", WORKSPACE_DIR, name, `./${RESUME_SCRIPT}`], {
      timeoutMs: RESUME_TIMEOUT_MS,
    });
    if (ran.code !== 0) {
      console.warn(`${RESUME_SCRIPT} did not finish well (exit ${ran.code}):`, ran.stderr.trim());
    }
  }

  async #awaitDaemon(threadId: string) {
    const timeoutMs = this.#config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    const reachAt = Date.now() + (this.#config.reachCheckAfterMs ?? DEFAULT_REACH_CHECK_AFTER_MS);
    let reachChecked = false;
    while (!this.#hub.isConnected(threadId)) {
      if (Date.now() >= deadline) {
        await this.#teardown(threadId);
        throw new Error(`The sandbox did not connect within ${Math.round(timeoutMs / 1000)}s`);
      }
      if (!reachChecked && Date.now() >= reachAt) {
        reachChecked = true;
        const reaches = await containerReachesHost(
          this.#run,
          this.#name(threadId),
          this.#host,
          this.#port,
        );
        if (!reaches && !this.#hub.isConnected(threadId)) {
          await this.#teardown(threadId);
          throw new Error(reachAdvice(this.#host, this.#port));
        }
      }
      await Bun.sleep(CONNECT_POLL_MS);
    }
  }

  #dropTokens(threadId: string) {
    for (const [token, id] of this.#tokens) if (id === threadId) this.#tokens.delete(token);
  }
}
