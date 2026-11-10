import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import { createDesktopTools } from "@anvia/sandbox";
import { WORKSPACE_DIR } from "@aven/agents/sandbox-tools";
import type {
  ComputerState,
  RepoAccess,
  RunEnvVar,
  RunGithub,
  RunIdentityCredential,
} from "@aven/protocol/types";

import { ArtifactStore } from "./artifacts";
import { DirectorySandbox } from "./directory-sandbox";
import { forkWorkspace } from "./fork-workspace";
import { cloneRepository, git, isCloned } from "./git-clone";
import { signInCommand } from "./github-signin";
import { identitySignInCommand, originOf } from "./identity-signin";
import { ensureLocalExcludes } from "./local-excludes";
import { MacDesktop } from "./mac-desktop";
import { MacVm, syntheticConf } from "./mac-vm";
import { envOf, withProjectEnv } from "./project-env";
import { secretRedactor } from "./secret-redaction";
import { runtimeHome } from "./sandbox";
import { SkillStore } from "./skills";
import { startedOnUse } from "./started-on-use";
import { threadProcesses } from "./thread-processes";
import { hasRunningProcesses, sandboxTools } from "./thread-tools";
import { UploadStore } from "./uploads";
import type {
  AcquireOptions,
  MacSandboxConfig,
  ThreadRef,
  ThreadSandbox,
  ThreadWorkspaces,
} from "./types";

const PREPARED_PREFIX = "aven-mac-ready-";
const VM_PREFIX = "aven-mac-";
const SIGN_IN_TIMEOUT_MS = 30_000;

const slug = (value: string) => value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

export class MacSandboxes implements ThreadWorkspaces {
  readonly artifacts: ArtifactStore;
  readonly uploads: UploadStore;
  readonly skills: SkillStore;
  #config: MacSandboxConfig;
  #bin: string;
  #prepared: string;
  #roots = new Map<string, Promise<string>>();
  #sandboxes = new Map<string, DirectorySandbox>();
  #desktops = new Map<string, MacDesktop>();
  #vms = new Map<string, MacVm>();
  #holder: string | undefined;
  #starting = new Map<string, Promise<void>>();
  #starts = new Map<string, () => Promise<void>>();
  #projectEnv = new Map<string, Readonly<Record<string, string>>>();
  #redactors = new Map<string, ReturnType<typeof secretRedactor>>();

  private constructor(config: MacSandboxConfig, bin: string) {
    this.#config = config;
    this.#bin = bin;
    this.#prepared = `${PREPARED_PREFIX}${slug(config.base)}`;
    const home = runtimeHome(config.home);
    this.artifacts = new ArtifactStore(join(home, "artifacts"));
    this.uploads = new UploadStore(join(home, "uploads"));
    this.skills = new SkillStore(join(home, "skills"));
  }

  static async start(config: MacSandboxConfig) {
    const bin = config.bin ?? Bun.which("tart");
    if (!bin) {
      throw new Error(
        "A macOS sandbox needs Tart (https://tart.run): install it, or set AVEN_MAC_TART to its path.",
      );
    }
    const sandboxes = new MacSandboxes(config, bin);
    await sandboxes.#preflight();
    return sandboxes;
  }

  #vm(name: string) {
    return new MacVm({
      bin: this.#bin,
      name,
      base: this.#prepared,
      home: this.#config.tartHome,
      cpus: this.#config.cpus,
      memoryMb: this.#config.memoryMb,
      connectTimeoutMs: this.#config.connectTimeoutMs,
    });
  }

  async #preflight() {
    const probe = this.#vm("preflight");
    const version = await probe.tart(["--version"]);
    if (version.code !== 0) throw new Error(`Tart does not run: ${version.stderr.trim()}`);
    if (!(await probe.has(this.#config.base))) {
      throw new Error(
        `The macOS image ${this.#config.base} is not on this Mac: run tart pull ${this.#config.base}`,
      );
    }
    if (await probe.has(this.#prepared)) return;
    await this.#prepare();
  }

  async #prepare() {
    const home = runtimeHome(this.#config.home);
    const shares = ["workspace", "uploads", "skills"].map((name) => ({
      name,
      dir: join(home, "mac-prepare", name),
    }));
    await Promise.all(shares.map(({ dir }) => mkdir(dir, { recursive: true })));
    const vm = new MacVm({
      bin: this.#bin,
      name: this.#prepared,
      base: this.#config.base,
      home: this.#config.tartHome,
      connectTimeoutMs: this.#config.connectTimeoutMs,
    });
    try {
      await vm.start(shares);
      const written = await vm.exec(
        [],
        `printf '%s' '${syntheticConf()}' | /usr/bin/sudo -n /usr/bin/tee /etc/synthetic.conf >/dev/null && /bin/sync`,
      );
      if (written.code !== 0) {
        throw new Error(`Could not set up the macOS image: ${written.stderr.trim()}`);
      }
      await vm.stop();
    } catch (error) {
      await vm.remove().catch(() => undefined);
      throw error;
    }
  }

  #name(threadId: string) {
    return `${VM_PREFIX}${threadId}`;
  }

  #workspaceDir(threadId: string) {
    return join(runtimeHome(this.#config.home), "workspaces", threadId);
  }

  #workspace(thread: ThreadRef, repo?: () => Promise<RepoAccess>) {
    const known = this.#roots.get(thread.id);
    if (known) return known;
    const preparing = this.#fill(thread, repo);
    this.#roots.set(thread.id, preparing);
    preparing.catch(() => this.#roots.delete(thread.id));
    return preparing;
  }

  async #fill(thread: ThreadRef, repo?: () => Promise<RepoAccess>) {
    const dir = this.#workspaceDir(thread.id);
    await mkdir(dir, { recursive: true });
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

  async acquire(
    thread: ThreadRef,
    repo?: () => Promise<RepoAccess>,
    { lazy = false }: AcquireOptions = {},
  ): Promise<ThreadSandbox> {
    const eager = !(lazy && repo);
    const root = eager ? await this.#workspace(thread, repo) : undefined;
    const vm = this.#vms.get(thread.id) ?? this.#vm(this.#name(thread.id));
    this.#vms.set(thread.id, vm);
    const start = () => this.#startVm(thread, repo, vm);
    this.#starts.set(thread.id, start);
    const sandbox = new DirectorySandbox(
      thread.id,
      root ?? (await this.#workspace(thread, repo)),
      vm.launch,
      WORKSPACE_DIR,
      vm.terminate,
    );
    this.#sandboxes.set(thread.id, sandbox);
    const runtime = withProjectEnv(startedOnUse(sandbox, start), () =>
      this.#projectEnv.get(thread.id),
    );
    const desktop = new MacDesktop({ endpoint: () => vm.vnc, start });
    this.#desktops.get(thread.id)?.dispose();
    this.#desktops.set(thread.id, desktop);
    return {
      tools: [
        ...sandboxTools(runtime, { id: thread.id, artifacts: this.artifacts }),
        ...createDesktopTools({ sandbox: startedOnUse(desktop, start) }),
      ],
      hasRunningProcesses: async () => vm.running && (await hasRunningProcesses(runtime)),
      processes: threadProcesses(
        runtime,
        () => vm.running,
        () => this.#redactors.get(thread.id),
      ),
      start,
      state: () => this.computerState(thread.id),
    };
  }

  #startVm(thread: ThreadRef, repo: (() => Promise<RepoAccess>) | undefined, vm: MacVm) {
    const known = this.#starting.get(thread.id);
    if (known) return known;
    if (this.#holder !== undefined && this.#holder !== thread.id) {
      return Promise.reject(
        new Error(
          "This Mac runs one macOS sandbox at a time, and another thread has it: let that thread finish or stop it",
        ),
      );
    }
    this.#holder = thread.id;
    const starting = (async () => {
      const root = await this.#workspace(thread, repo);
      await vm.start([
        { name: "workspace", dir: root },
        { name: "uploads", dir: await this.uploads.dir(thread.id), readOnly: true },
        { name: "skills", dir: await this.skills.dir(thread.id), readOnly: true },
      ]);
    })();
    this.#starting.set(thread.id, starting);
    const clear = () => {
      this.#starting.delete(thread.id);
      if (!vm.running && this.#holder === thread.id) this.#holder = undefined;
    };
    starting.then(clear, clear);
    return starting;
  }

  computerState(threadId: string): ComputerState {
    if (this.#vms.get(threadId)?.running) return "awake";
    return this.#starting.has(threadId) ? "waking" : "asleep";
  }

  desktop(threadId: string) {
    return this.#vms.get(threadId)?.running ? this.#desktops.get(threadId) : undefined;
  }

  running() {
    return this.#holder === undefined ? 0 : 1;
  }

  async workspace(threadId: string) {
    const dir = this.#workspaceDir(threadId);
    return (await isCloned(dir)) ? realpath(dir) : undefined;
  }

  async release(threadId: string) {
    await this.#starting.get(threadId)?.catch(() => undefined);
    this.#desktops.get(threadId)?.dispose();
    this.#desktops.delete(threadId);
    await this.#sandboxes.get(threadId)?.dispose();
    this.#sandboxes.delete(threadId);
    this.#starts.delete(threadId);
    await this.#vms.get(threadId)?.stop();
    if (this.#holder === threadId) this.#holder = undefined;
    this.#roots.delete(threadId);
    this.#projectEnv.delete(threadId);
    this.#redactors.delete(threadId);
  }

  async putAway(threadId: string) {
    await this.release(threadId);
    await this.#vm(this.#name(threadId)).remove();
    this.#vms.delete(threadId);
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
      identitySignInCommand(identity, originOf(controlPlane)),
    );
  }

  async #signIn(
    threadId: string,
    what: string,
    { script, env }: { script: string; env: Record<string, string> },
  ) {
    const sandbox = this.#sandboxes.get(threadId);
    if (!sandbox) throw new Error("The thread has no sandbox yet");
    const result = await startedOnUse(sandbox, this.#starts.get(threadId) ?? (async () => {})).exec(
      {
        command: "sh",
        args: ["-c", script],
        env,
        timeoutMs: SIGN_IN_TIMEOUT_MS,
      },
    );
    if (result.status !== "exited" || result.exitCode !== 0) {
      throw new Error(
        `Could not sign in to ${what}: ${new TextDecoder().decode(result.stderr).trim()}`,
      );
    }
  }

  async dispose() {
    const threads = new Set(this.#vms.keys());
    await Promise.all(
      [...threads].map((id) =>
        this.release(id).catch((error: unknown) => {
          console.error(`Could not stop the macOS sandbox of thread ${id}:`, error);
        }),
      ),
    );
  }
}
