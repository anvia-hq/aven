import { randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createDesktopTools } from "@anvia/sandbox";
import { RemoteSandboxHub } from "@anvia/sandbox/remote";
import type { AnyTool } from "@anvia/core";
import { UPLOADS_DIR } from "@aven/agents/attachments";
import { WORKSPACE_DIR } from "@aven/agents/sandbox-tools";
import { SKILLS_DIR } from "@aven/agents/skills";
import { asRecord } from "@aven/agents/values";

import type { SandboxDesktop } from "@anvia/sandbox";
import type { RepoAccess } from "@aven/protocol/runtime-wire";

import { ArtifactStore } from "./artifacts";
import {
  RESUME_SCRIPT,
  SETUP_SCRIPT,
  scriptState,
  setupEnvironment,
  type DockerRun,
} from "./environment-setup";
import { clearDirectory, cloneRepository, git, isCloned, type Git } from "./git-clone";
import { updateRestoredWorkspace } from "./restore-workspace";
import { runCommand } from "./run-command";
import { SkillStore } from "./skills";
import { SnapshotStore } from "./snapshots";
import { hasRunningProcesses, sandboxTools } from "./thread-tools";
import { UploadStore } from "./uploads";

// Where a runner keeps its workspaces and its journal of runs.
export const runtimeHome = (home?: string) => home ?? join(homedir(), ".aven", "runtime");
export const journalPathIn = (home?: string) => join(runtimeHome(home), "runs.db");

export type SandboxConfig = {
  /** A desktop sandbox image (see apps/runtime/sandbox-image). */
  image: string;
  /**
   * The platform containers are started for, e.g. `linux/amd64` to run the image with Google
   * Chrome on an arm64 host under emulation (decision 0014). Default: the host's own.
   */
  platform?: string;
  /**
   * The Docker runtime containers run under, as registered in the daemon, e.g. `runsc` for gVisor so
   * a container does not share the host kernel (decision 0016). Default: the daemon's own.
   */
  runtime?: string;
  /** Where the runner keeps thread workspaces, in `workspaces/<thread id>`. Default `~/.aven/runtime`. */
  home?: string;
  memoryMb?: number;
  cpus?: number;
  pidsLimit?: number;
  /** Where the container finds this machine; the default works on Docker Desktop and Linux. */
  hostName?: string;
  /** How long to wait for a started container's daemon to dial in. Default 90 seconds. */
  connectTimeoutMs?: number;
  /** Replaced in tests. */
  git?: Git;
  /** Replaced in tests. */
  docker?: DockerRun;
};

export type ThreadSandbox = {
  /** What the agent can do in the thread's container: files, commands, processes and a desktop. */
  tools: readonly AnyTool[];
  /** Whether a process the agent started there, such as a dev server, is still running. */
  hasRunningProcesses(): Promise<boolean>;
};

type Docker = DockerRun;

const PLATFORM_PATTERN = /^linux\/(amd64|arm64)(\/v\d+)?$/;
const RUNTIME_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/i;
const DEFAULT_CONNECT_TIMEOUT_MS = 90_000;
const CONNECT_POLL_MS = 50;
// `.aven/resume` is for a quick login or repair: the agent waits this long for it, then goes on.
const RESUME_TIMEOUT_MS = 10_000;

const docker: Docker = (args, options) => runCommand(["docker", ...args], options);

type DockerRunInput = {
  name: string;
  threadId: string;
  image: string;
  /** The thread's workspace on this machine. */
  root: string;
  /** The files the thread's users attached, on this machine; mounted read-only (decision 0034). */
  uploads: string;
  /** The skills of the thread's runs, on this machine; mounted read-only (decision 0035). */
  skills: string;
  /** How the container reaches this machine. */
  host: string;
  hubPort: number;
  token: string;
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
  /** Passed to `docker run --platform`; the host's own when not set. */
  platform?: string;
  /** Passed to `docker run --runtime`; the daemon's default when not set. */
  runtime?: string;
  /** `uid:gid` to run as, so files written to the bind mount belong to the host user. */
  user?: string;
};

// The `docker run` arguments for one thread's container.
export function dockerRunArgs(input: DockerRunInput) {
  const args = [
    "run",
    "-d",
    "--name",
    input.name,
    "--label",
    "aven.sandbox=1",
    "--label",
    `aven.thread=${input.threadId}`,
    "--add-host",
    `${input.host}:host-gateway`,
    "--memory",
    `${input.memoryMb}m`,
    "--cpus",
    String(input.cpus),
    "--pids-limit",
    String(input.pidsLimit),
    "--shm-size",
    "512m",
    "--security-opt",
    "no-new-privileges",
    "-v",
    `${input.root}:${WORKSPACE_DIR}`,
    "-v",
    `${input.uploads}:${UPLOADS_DIR}:ro`,
    "-v",
    `${input.skills}:${SKILLS_DIR}:ro`,
    "-e",
    `ANVIA_CONTROL_URL=ws://${input.host}:${input.hubPort}/daemon`,
    "-e",
    `ANVIA_SANDBOX_TOKEN=${input.token}`,
    "-e",
    `ANVIA_SANDBOX_WORKDIR=${WORKSPACE_DIR}`,
  ];
  if (input.platform) args.push("--platform", input.platform);
  if (input.runtime) args.push("--runtime", input.runtime);
  if (input.user) args.push("--user", input.user);
  args.push(input.image);
  return args;
}

function safeJson(text: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return {};
  }
}

/** What a runner runs on its own machine: Docker for the containers, git for the clones. */
type HostCommands = { docker: Docker; git: Git };

// What a runner needs before it can take a thread: the image, git, and a platform and runtime
// Docker knows. Each failure says what to do about it.
async function preflight(config: SandboxConfig, { docker: run, git: gitRun }: HostCommands) {
  const check = await run(["image", "inspect", config.image]).catch(() => ({
    code: 1,
    stdout: "",
    stderr: "docker is not installed or not running",
  }));
  if (check.code !== 0) {
    throw new Error(
      `The sandbox image ${config.image} is not available (${check.stderr.trim() || "unknown error"}). ` +
        `Docker must be running; build the image with: docker build -t ${config.image} apps/runtime/sandbox-image`,
    );
  }
  const gitCheck = await gitRun(["--version"], { cwd: "." }).catch(() => ({
    code: 1,
    stdout: "",
    stderr: "git is not installed",
  }));
  if (gitCheck.code !== 0) {
    throw new Error("git is required to clone each thread's repository but was not found");
  }
  if (config.platform !== undefined && !PLATFORM_PATTERN.test(config.platform)) {
    throw new Error(
      `The sandbox platform "${config.platform}" is not one Docker knows; use linux/amd64 or linux/arm64`,
    );
  }
  if (config.runtime !== undefined) {
    if (!RUNTIME_PATTERN.test(config.runtime)) {
      throw new Error(`The sandbox runtime "${config.runtime}" is not a Docker runtime name`);
    }
    const info = await run(["info", "--format", "{{json .Runtimes}}"]);
    const registered: Record<string, unknown> = info.code === 0 ? safeJson(info.stdout) : {};
    if (!(config.runtime in registered)) {
      throw new Error(
        `The Docker daemon has no runtime "${config.runtime}" (AVEN_SANDBOX_RUNTIME); for gVisor, install runsc and register it with \`runsc install\`, then restart Docker`,
      );
    }
  }
}

/** What a runner needs to run a thread: the sandbox its agent works in. */
export interface ThreadWorkspaces {
  /**
   * `repo` asks the control plane how to clone the thread's repository; it is called only when the
   * workspace holds no clone yet (decision 0013).
   */
  acquire(
    thread: { id: string; organizationId?: string },
    repo: () => Promise<RepoAccess>,
  ): Promise<ThreadSandbox>;
  /** The desktop of the thread's sandbox while its container is running; never starts one. */
  desktop(threadId: string): SandboxDesktop | undefined;
  /** The thread's workspace directory on this machine once it holds a clone; never clones one. */
  workspace(threadId: string): Promise<string | undefined>;
  /** Frees what a thread holds (its container); its workspace files stay for the next `acquire`. */
  release(threadId: string): Promise<void>;
  /**
   * Runs the repository's `.aven/setup` again in a setup container and keeps what it makes as the
   * snapshot new threads start from (decision 0043). Throws, with the end of the script's output,
   * when there is no script or it fails. Without it, an agent cannot save an environment.
   */
  saveEnvironment?(
    thread: { id: string; organizationId?: string },
    access: RepoAccess,
  ): Promise<{ image: string }>;
  /** The images agents showed (decision 0033); without it, none can be read back. */
  readonly artifacts?: ArtifactStore;
  /** The files users attach (decision 0034); without it, a message with files cannot run. */
  readonly uploads?: UploadStore;
  /** The skills of runs (decision 0035); without it, runs have none. */
  readonly skills?: SkillStore;
  dispose(): Promise<void>;
}

// Gives an agent a Docker container to work in instead of the host (decisions 0009, 0010, 0012).
// Each thread gets its own container from a desktop image, with an empty workspace directory the
// runner manages mounted at /workspace; every tool the agent has acts inside the container, so it
// sees that directory and nothing else of the runner's.
// A daemon in the container dials out to a hub in this process, authenticated by a one-container
// token; the control plane is not involved.
export class Sandboxes implements ThreadWorkspaces {
  readonly artifacts: ArtifactStore;
  readonly uploads: UploadStore;
  readonly skills: SkillStore;
  /** What repositories' setups made on this runner (decision 0043). */
  readonly snapshots: SnapshotStore;
  #config: SandboxConfig;
  #hub: RemoteSandboxHub;
  #port: number;
  #tokens: Map<string, string>;
  #run: Docker;
  #git: Git;
  #running = new Set<string>();
  // A thread's workspace, while it is being cloned or once it is ready, so two runs never clone twice.
  #roots = new Map<string, Promise<string>>();
  // The setup or restore of a repository's environment, one at a time, so a second thread on the
  // repository finds the snapshot the first made instead of running the setup again.
  #environments = new Map<string, Promise<unknown>>();
  #starting = new Map<string, Promise<void>>();

  private constructor(
    config: SandboxConfig,
    commands: HostCommands,
    hub: RemoteSandboxHub,
    port: number,
    tokens: Map<string, string>,
  ) {
    this.#config = config;
    this.artifacts = new ArtifactStore(join(runtimeHome(config.home), "artifacts"));
    this.uploads = new UploadStore(join(runtimeHome(config.home), "uploads"));
    this.skills = new SkillStore(join(runtimeHome(config.home), "skills"));
    this.snapshots = new SnapshotStore(join(runtimeHome(config.home), "snapshots"));
    this.#hub = hub;
    this.#port = port;
    this.#tokens = tokens;
    this.#run = commands.docker;
    this.#git = commands.git;
  }

  // Fails now, with what to do about it, rather than on the first run.
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
    // The container reaches this port through the host gateway, so it cannot be loopback-only.
    const { port } = await hub.listen({ host: "0.0.0.0", port: 0, path: "/daemon" });
    const sandboxes = new Sandboxes(config, commands, hub, port, tokens);
    // Containers left by a crashed runtime would hold project directories open.
    await sandboxes.#removeStale();
    return sandboxes;
  }

  async acquire(
    thread: { id: string; organizationId?: string },
    repo: () => Promise<RepoAccess>,
  ): Promise<ThreadSandbox> {
    const root = await this.#workspace(thread, repo);
    await this.#ensure(thread.id, root);
    const runtime = this.#hub.runtime(thread.id, { workdir: WORKSPACE_DIR });
    return {
      tools: [
        ...sandboxTools(runtime, { id: thread.id, artifacts: this.artifacts }),
        ...createDesktopTools({ sandbox: this.#hub.desktop(thread.id) }),
      ],
      // A container that is gone has nothing running, and asking it would wait for a daemon.
      hasRunningProcesses: async () =>
        this.#hub.isConnected(thread.id) && (await hasRunningProcesses(runtime)),
    };
  }

  desktop(threadId: string) {
    return this.#hub.isConnected(threadId) ? this.#hub.desktop(threadId) : undefined;
  }

  async workspace(threadId: string) {
    const dir = this.#workspaceDir(threadId);
    return (await isCloned(dir)) ? realpath(dir) : undefined;
  }

  async release(threadId: string) {
    // A container that is still starting would otherwise come up after we removed it.
    await this.#starting.get(threadId)?.catch(() => undefined);
    this.#roots.delete(threadId);
    await this.#teardown(threadId);
  }

  async #teardown(threadId: string) {
    this.#running.delete(threadId);
    this.#dropTokens(threadId);
    this.#hub.forget(threadId);
    await this.#run(["rm", "-f", this.#name(threadId)]);
  }

  async dispose() {
    const threads = new Set([...this.#running, ...this.#starting.keys()]);
    // One container that will not go must not keep the hub open.
    const released = [...threads].map((id) =>
      this.release(id).catch((error: unknown) => {
        console.error(`Could not remove the sandbox of thread ${id}:`, error);
      }),
    );
    await Promise.all(released);
    await this.#hub.close();
  }

  // The thread's workspace: the repository cloned on first use (or restored from its snapshot) and
  // kept for its later runs. Real path, so the file tools' confinement and the bind mount agree on
  // what the directory is.
  #workspace(thread: { id: string; organizationId?: string }, repo: () => Promise<RepoAccess>) {
    const known = this.#roots.get(thread.id);
    if (known) return known;
    const preparing = this.#prepare(thread, repo);
    this.#roots.set(thread.id, preparing);
    // A failed clone is tried again by the next run.
    preparing.catch(() => this.#roots.delete(thread.id));
    return preparing;
  }

  async #prepare(thread: { id: string; organizationId?: string }, repo: () => Promise<RepoAccess>) {
    const dir = this.#workspaceDir(thread.id);
    await mkdir(dir, { recursive: true });
    const root = await realpath(dir);
    if (await isCloned(root)) return root;
    const access = await repo();
    const environment = await this.#environmentOf(thread, access);
    if (!environment) {
      await cloneRepository(root, thread.id, access, this.#git);
      return root;
    }
    await this.#inTurn(environment.key, () => this.#fill(thread.id, root, access, environment));
    return root;
  }

  // The repository's snapshot key and the image it must be made from; null where snapshots do not
  // apply: a thread with no organization, or a Docker that cannot name the sandbox image.
  async #environmentOf(thread: { organizationId?: string }, access: RepoAccess) {
    if (!thread.organizationId) return null;
    const inspected = await this.#run([
      "image",
      "inspect",
      "--format",
      "{{.Id}}",
      this.#config.image,
    ]);
    const baseImageId = inspected.code === 0 ? inspected.stdout.trim() : "";
    if (!baseImageId) return null;
    return { key: this.snapshots.keyFor(thread.organizationId, access.cloneUrl), baseImageId };
  }

  // One at a time per key; a failure of one does not stop the next.
  #inTurn<T>(key: string, work: () => Promise<T>) {
    const turn = (this.#environments.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(work);
    this.#environments.set(key, turn);
    return turn.finally(() => {
      if (this.#environments.get(key) === turn) this.#environments.delete(key);
    });
  }

  // Puts the repository in `root`: restored from the snapshot when there is a valid one, else
  // cloned and, when the repository has a setup script, set up and snapshotted (decision 0043).
  async #fill(
    threadId: string,
    root: string,
    access: RepoAccess,
    { key, baseImageId }: { key: string; baseImageId: string },
  ) {
    const snapshot = await this.snapshots.valid(key, baseImageId);
    if (snapshot) {
      try {
        await this.snapshots.restore(snapshot, root);
        await updateRestoredWorkspace(root, threadId, access, this.#git);
        await this.#pinImage(threadId, snapshot.image);
        return;
      } catch (error) {
        // A snapshot that cannot be restored is not worth failing the thread for: clone afresh.
        console.warn(`Could not restore the environment of ${access.cloneUrl}:`, error);
        await clearDirectory(root);
      }
    }
    await cloneRepository(root, threadId, access, this.#git);
    await this.#setUp(threadId, root, key, baseImageId);
  }

  // Runs the repository's `.aven/setup`, if it has one, and keeps what it made. A setup that fails
  // does not fail the thread: it works on the bare image, and the next thread tries again.
  async #setUp(threadId: string, root: string, key: string, baseImageId: string) {
    const state = await scriptState(root, SETUP_SCRIPT);
    if (state === "missing") return;
    if (state === "not-executable") {
      console.warn(`${SETUP_SCRIPT} is not executable (chmod +x); it was not run`);
      return;
    }
    try {
      await this.#build(threadId, root, key, baseImageId);
    } catch (error) {
      console.warn(`The setup of ${key} failed; see ${this.snapshots.logPath(key)}:`, error);
    }
  }

  // The setup itself: runs the script, keeps the snapshot and points the thread at its image.
  async #build(threadId: string, root: string, key: string, baseImageId: string) {
    const { memoryMb = 8192, cpus = 4, pidsLimit = 1024 } = this.#config;
    const image = this.snapshots.imageFor(key);
    await setupEnvironment({
      docker: this.#run,
      key,
      baseImage: this.#config.image,
      image,
      root,
      logPath: this.snapshots.logPath(key),
      memoryMb,
      cpus,
      pidsLimit,
      platform: this.#config.platform,
      runtime: this.#config.runtime,
      hostUser: hostUser(),
    });
    await this.snapshots.publish(key, { image, baseImageId, workspace: root });
    await this.#pinImage(threadId, image);
    return { image };
  }

  async saveEnvironment(thread: { id: string; organizationId?: string }, access: RepoAccess) {
    const root = await this.workspace(thread.id);
    if (!root) throw new Error("The thread has no workspace yet");
    const environment = await this.#environmentOf(thread, access);
    if (!environment)
      throw new Error("Environments cannot be saved here: the sandbox image is not known");
    const state = await scriptState(root, SETUP_SCRIPT);
    if (state === "missing") {
      throw new Error(
        `The repository has no ${SETUP_SCRIPT}: write one, then save the environment`,
      );
    }
    if (state === "not-executable") {
      throw new Error(`${SETUP_SCRIPT} is not executable: run chmod +x ${SETUP_SCRIPT}`);
    }
    return this.#inTurn(environment.key, () =>
      this.#build(thread.id, root, environment.key, environment.baseImageId),
    );
  }

  // A thread keeps the image it started from, so its container does not change under it when the
  // snapshot is replaced or goes out of date.
  #imageFile(threadId: string) {
    return join(runtimeHome(this.#config.home), "environments", `${threadId}.image`);
  }

  async #pinImage(threadId: string, image: string) {
    await mkdir(join(runtimeHome(this.#config.home), "environments"), { recursive: true });
    await writeFile(this.#imageFile(threadId), image);
  }

  async #imageOf(threadId: string) {
    const pinned = await readFile(this.#imageFile(threadId), "utf8").catch(() => "");
    return pinned.trim() || this.#config.image;
  }

  #workspaceDir(threadId: string) {
    return join(runtimeHome(this.#config.home), "workspaces", threadId);
  }

  #name(threadId: string) {
    return `aven-sandbox-${threadId}`;
  }

  async #removeStale() {
    const { stdout } = await this.#run(["ps", "-aq", "--filter", "label=aven.sandbox"]);
    const ids = stdout.split("\n").filter(Boolean);
    if (ids.length > 0) await this.#run(["rm", "-f", ...ids]);
  }

  // Starts the thread's container once, even when several runs ask at the same time, and
  // resolves only when its daemon is connected: a run that finds the container running but not
  // yet connected must wait for it, never restart it.
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
    const token = randomBytes(24).toString("base64url");
    this.#dropTokens(threadId);
    this.#tokens.set(token, threadId);
    const { memoryMb = 8192, cpus = 4, pidsLimit = 1024 } = this.#config;
    const args = dockerRunArgs({
      name,
      threadId,
      image: await this.#imageOf(threadId),
      root,
      // Made before the container starts, so a file attached while it runs shows up in it.
      uploads: await this.uploads.dir(threadId),
      skills: await this.skills.dir(threadId),
      host: this.#config.hostName ?? "host.docker.internal",
      hubPort: this.#port,
      token,
      memoryMb,
      cpus,
      pidsLimit,
      platform: this.#config.platform,
      runtime: this.#config.runtime,
      user: hostUser(),
    });
    const started = await this.#run(args);
    if (started.code !== 0) {
      this.#tokens.delete(token);
      throw new Error(`Could not start the sandbox: ${started.stderr.trim() || started.stdout}`);
    }
    this.#running.add(threadId);
    await this.#awaitDaemon(threadId);
    await this.#resume(name, root);
  }

  // Runs the repository's `.aven/resume`, if it has one, now that the container is up. The run
  // waits for it a few seconds at most; a failure is logged and the agent goes on.
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
    while (!this.#hub.isConnected(threadId)) {
      if (Date.now() >= deadline) {
        await this.#teardown(threadId);
        throw new Error(`The sandbox did not connect within ${Math.round(timeoutMs / 1000)}s`);
      }
      await Bun.sleep(CONNECT_POLL_MS);
    }
  }

  #dropTokens(threadId: string) {
    for (const [token, id] of this.#tokens) if (id === threadId) this.#tokens.delete(token);
  }
}

// On Linux a bind mount keeps host ownership, so files must be written as the host user.
function hostUser() {
  if (process.platform !== "linux" || !process.getuid || !process.getgid) return undefined;
  return `${process.getuid()}:${process.getgid()}`;
}
