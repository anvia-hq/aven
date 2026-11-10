import { codexEnvironment } from "./codex-engine";
import type { CodexLoginAction, CodexLoginState } from "@aven/protocol/types";
import type { CodexSupport } from "./types";

const FLOW_MS = 15 * 60_000;
const STATUS_MS = 10_000;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const URL_PATTERN = /https:\/\/[^\s]+/;
const CODE_PATTERN = /\b[A-Z0-9]{4}-[A-Z0-9]{5}\b/;

type Flow = {
  child: ReturnType<typeof Bun.spawn>;
  output: string;
  state: CodexLoginState;
  cancelled: boolean;
};

export class CodexLogin {
  #flow: Flow | undefined;

  constructor(private support: CodexSupport) {}

  async call(action: CodexLoginAction): Promise<CodexLoginState> {
    if (action === "cancel") return this.#cancel();
    if (action === "start") return this.#start();
    return this.#status();
  }

  async #signedIn(): Promise<CodexLoginState> {
    try {
      const child = Bun.spawn([this.support.path, "login", "status"], {
        env: codexEnvironment(this.support.env),
        stdout: "ignore",
        stderr: "ignore",
      });
      const stopper = setTimeout(() => child.kill(), STATUS_MS);
      const code = await child.exited;
      clearTimeout(stopper);
      return { state: code === 0 ? "signed-in" : "signed-out" };
    } catch (error) {
      return {
        state: "unavailable",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async #status(): Promise<CodexLoginState> {
    const flow = this.#flow;
    if (flow?.state.state === "waiting") return { ...flow.state };
    if (flow?.state.state === "failed") {
      this.#flow = undefined;
      return { ...flow.state };
    }
    return this.#signedIn();
  }

  #cancel(): CodexLoginState {
    const flow = this.#flow;
    if (flow) {
      flow.cancelled = true;
      flow.child.kill();
    }
    this.#flow = undefined;
    return { state: "signed-out" };
  }

  async #start(): Promise<CodexLoginState> {
    if (this.#flow?.state.state === "waiting") return { ...this.#flow.state };
    this.#flow = undefined;
    const current = await this.#signedIn();
    if (current.state !== "signed-out") return current;
    const child = Bun.spawn([this.support.path, "login", "--device-auth"], {
      env: codexEnvironment(this.support.env),
      stdout: "pipe",
      stderr: "pipe",
    });
    const flow: Flow = { child, output: "", state: { state: "waiting" }, cancelled: false };
    this.#flow = flow;
    const stopper = setTimeout(() => child.kill(), FLOW_MS);
    stopper.unref();
    const read = async (stream: ReadableStream<Uint8Array>) => {
      const decoder = new TextDecoder();
      for await (const chunk of stream) {
        flow.output += decoder.decode(chunk, { stream: true });
        const text = flow.output.replace(ANSI, "");
        const url = URL_PATTERN.exec(text)?.[0];
        const code = CODE_PATTERN.exec(text)?.[0];
        if (flow.state.state === "waiting") flow.state = { state: "waiting", url, code };
      }
    };
    void Promise.all([read(child.stdout), read(child.stderr)]);
    void child.exited.then(async (exit) => {
      clearTimeout(stopper);
      if (flow.cancelled || this.#flow !== flow) return;
      this.#flow = undefined;
      if (exit === 0) return;
      const last = flow.output.replace(ANSI, "").trim().split("\n").at(-1)?.trim();
      this.#flow = flow;
      flow.state = { state: "failed", error: last || `Codex stopped with code ${exit}` };
    });
    await this.#settle(flow);
    return { ...flow.state };
  }

  async #settle(flow: Flow) {
    for (let waited = 0; waited < 5_000 && !flow.state.code && flow.state.state === "waiting";) {
      await Bun.sleep(100);
      waited += 100;
    }
  }
}
