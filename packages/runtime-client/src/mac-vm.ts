import { WORKSPACE_DIR } from "@aven/agents/sandbox-tools";
import { UPLOADS_DIR } from "@aven/agents/attachments";
import { SKILLS_DIR } from "@aven/agents/skills";

import type {
  Launch,
  MacVmOptions,
  Spawned,
  Terminate,
  VmRun,
  VmShare,
  VncEndpoint,
} from "./types";

const DEFAULT_CONNECT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_POLL_MS = 1000;
const SHARED_FILES = "/Volumes/My Shared Files";
const VNC_URL = /vnc:\/\/:([^@\s]*)@([^:\s]+):(\d+)/;
const VNC_WAIT_MS = 5000;
const DEFAULT_DISPLAY = "1280x800px";
const MAX_ERROR_CHARS = 8192;
const COMMAND_KEY =
  '{"UserKeyMapping":[{"HIDKeyboardModifierMappingSrc":0x7000000E6,"HIDKeyboardModifierMappingDst":0x7000000E3}]}';

export const GUEST_LINKS = [WORKSPACE_DIR, UPLOADS_DIR, SKILLS_DIR].map((path) => path.slice(1));

export const syntheticConf = () =>
  `${GUEST_LINKS.map((name) => `${name}\t${SHARED_FILES.slice(1)}/${name}`).join("\n")}\n`;

const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

const PIDFILE_KEEP_MINUTES = 120;

const pidFile = (id: string) => `/tmp/.aven-run-${id}.pid`;

export function guestScript({
  argv,
  inside,
  env,
  id,
}: {
  argv: string[];
  inside: string;
  env?: Readonly<Record<string, string>>;
  id: string;
}) {
  const exports = Object.entries(env ?? {}).map(
    ([name, value]) => `export ${name}=${quote(value)}`,
  );
  const cwd = inside === "." ? WORKSPACE_DIR : `${WORKSPACE_DIR}/${inside}`;
  return [
    `find /tmp -maxdepth 1 -name '.aven-run-*.pid' -mmin +${PIDFILE_KEEP_MINUTES} -delete 2>/dev/null`,
    ...exports,
    `cd ${quote(cwd)} || exit 1`,
    `echo $$ > ${pidFile(id)}`,
    `exec /usr/bin/perl -e 'setpgrp(0, 0); exec @ARGV or die "$!\\n"' -- ${argv.map(quote).join(" ")}`,
    "",
  ].join("\n");
}

export const killScript = (id: string) =>
  [
    `f=${pidFile(id)}`,
    "for i in 1 2 3 4 5 6 7 8 9 10; do [ -f $f ] && break; sleep 0.2; done",
    "pid=$(cat $f 2>/dev/null) || exit 0",
    "kill -TERM -$pid 2>/dev/null",
    "sleep 2",
    "kill -KILL -$pid 2>/dev/null",
    "rm -f $f",
  ].join("; ");

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

export class MacVm {
  #options: MacVmOptions;
  #run: Spawned | undefined;
  #running = false;
  #vnc: VncEndpoint | undefined;
  #errors = "";

  constructor(options: MacVmOptions) {
    this.#options = options;
  }

  get name() {
    return this.#options.name;
  }

  get running() {
    return this.#running;
  }

  get vnc() {
    return this.#running ? this.#vnc : undefined;
  }

  #env() {
    const { home } = this.#options;
    return home ? { ...process.env, TART_HOME: home } : { ...process.env };
  }

  async tart(args: string[], timeoutMs?: number): Promise<VmRun> {
    let proc: Spawned;
    try {
      proc = Bun.spawn([this.#options.bin, ...args], {
        env: this.#env(),
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (error) {
      return {
        code: 127,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      };
    }
    const timer = timeoutMs ? setTimeout(() => proc.kill("SIGKILL"), timeoutMs) : undefined;
    try {
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout as ReadableStream).bytes(),
        new Response(proc.stderr as ReadableStream).bytes(),
        proc.exited,
      ]);
      return { code, stdout: decode(stdout), stderr: decode(stderr) };
    } finally {
      clearTimeout(timer);
    }
  }

  async has(name: string) {
    const listed = await this.tart(["list", "--quiet"]);
    return listed.code === 0 && listed.stdout.split("\n").some((line) => line.trim() === name);
  }

  exists() {
    return this.has(this.#options.name);
  }

  async create() {
    const { name, base, cpus, memoryMb } = this.#options;
    if (await this.exists()) return;
    const cloned = await this.tart(["clone", base, name]);
    if (cloned.code !== 0) {
      throw new Error(`Could not create the macOS VM from ${base}: ${cloned.stderr.trim()}`);
    }
    const set: string[] = ["--display", this.#options.display ?? DEFAULT_DISPLAY];
    if (cpus) set.push("--cpu", String(cpus));
    if (memoryMb) set.push("--memory", String(memoryMb));
    if (set.length > 0) await this.tart(["set", name, ...set]);
  }

  async start(shares: readonly VmShare[]) {
    if (this.#running) return;
    await this.create();
    const { bin, name, connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS } = this.#options;
    const dirs = shares.map(
      ({ name: tag, dir, readOnly }) => `--dir=${tag}:${dir}${readOnly ? ":ro" : ""}`,
    );
    const run = Bun.spawn([bin, "run", "--no-graphics", "--vnc-experimental", ...dirs, name], {
      env: this.#env(),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.#run = run;
    this.#vnc = undefined;
    this.#errors = "";
    void this.#watch(run.stdout as ReadableStream, false);
    void this.#watch(run.stderr as ReadableStream, true);
    let ended = false;
    void run.exited.then(() => {
      ended = true;
      this.#running = false;
    });
    const deadline = Date.now() + connectTimeoutMs;
    while (Date.now() < deadline) {
      if (ended) throw new Error(this.#whyEnded(run));
      const probe = await this.exec(["/usr/bin/true"]).catch(() => undefined);
      if (probe?.code === 0) {
        this.#running = true;
        await this.#ready();
        return;
      }
      await Bun.sleep(this.#options.pollMs ?? DEFAULT_POLL_MS);
    }
    await this.stop();
    throw new Error(`The macOS VM ${name} did not come up in ${connectTimeoutMs / 1000} seconds`);
  }

  async #watch(stream: ReadableStream, errors: boolean) {
    const decoder = new TextDecoder();
    let text = "";
    try {
      for await (const chunk of stream) {
        const piece = decoder.decode(chunk as Uint8Array, { stream: true });
        if (errors) this.#errors = (this.#errors + piece).slice(-MAX_ERROR_CHARS);
        text = (text + piece).slice(-MAX_ERROR_CHARS);
        const found = VNC_URL.exec(text);
        if (found && !this.#vnc) {
          this.#vnc = { password: found[1]!, host: found[2]!, port: Number(found[3]) };
        }
      }
    } catch {}
  }

  async #ready() {
    const waitUntil = Date.now() + VNC_WAIT_MS;
    while (!this.#vnc && Date.now() < waitUntil) await Bun.sleep(50);
    await this.exec(["/usr/bin/hidutil", "property", "--set", COMMAND_KEY]).catch(() => undefined);
  }

  #whyEnded(run: Spawned) {
    return `The macOS VM ${this.#options.name} stopped while starting: ${this.#errors.trim() || `exit ${run.exitCode}`}`;
  }

  exec(argv: string[], script?: string): Promise<VmRun> {
    return new Promise((resolve, reject) => {
      const proc = this.launchRaw(argv, script);
      Promise.all([
        new Response(proc.stdout as ReadableStream).bytes(),
        new Response(proc.stderr as ReadableStream).bytes(),
        proc.exited,
      ]).then(
        ([stdout, stderr, code]) =>
          resolve({ code, stdout: decode(stdout), stderr: decode(stderr) }),
        reject,
      );
    });
  }

  launchRaw(argv: string[], script?: string): Spawned {
    const args = ["exec"];
    if (script === undefined) args.push(this.#options.name, ...argv);
    else args.push("-i", this.#options.name, "/bin/bash", "-c", 'eval "$(cat)"');
    const proc = Bun.spawn([this.#options.bin, ...args], {
      env: this.#env(),
      stdin: script === undefined ? "ignore" : "pipe",
      stdout: "pipe",
      stderr: "pipe",
      detached: true,
    });
    if (script !== undefined) {
      const stdin = proc.stdin as unknown as { write(data: string): void; end(): void };
      stdin.write(script);
      stdin.end();
    }
    return proc;
  }

  #runs = new WeakMap<Spawned, string>();

  readonly launch: Launch = ({ argv, inside, env }) => {
    const id = crypto.randomUUID();
    const proc = this.launchRaw(argv, guestScript({ argv, inside, env, id }));
    this.#runs.set(proc, id);
    return proc;
  };

  readonly terminate: Terminate = async (proc) => {
    const id = this.#runs.get(proc);
    if (id === undefined || !this.#running) return;
    await this.exec(["/bin/bash", "-c", killScript(id)]).catch(() => undefined);
  };

  async stop() {
    const { name } = this.#options;
    this.#running = false;
    await this.tart(["stop", name, "--timeout", "20"]).catch(() => undefined);
    const run = this.#run;
    this.#run = undefined;
    if (run) {
      const stopped = await Promise.race([run.exited.then(() => true), Bun.sleep(25_000)]);
      if (stopped !== true) run.kill("SIGKILL");
      await run.exited;
    }
  }

  async remove() {
    await this.stop();
    if (await this.exists()) await this.tart(["delete", this.#options.name]);
  }
}
