// A runner for the bots' e2e (decision 0059): the real runner, with each bot's computer a temporary
// directory instead of a container, so no Docker. Its agent reaches the model through the control
// plane's gateway, as in production, and the person's provider is the pretend model (e2e/fake-model.ts).
// A computer is "running" once it is woken, and then has a pretend desktop and a pretend shell.
import { startRuntime } from "../packages/runtime-client/src/runner";
import type { ThreadWorkspaces } from "../packages/runtime-client/src/sandbox";
import { directoryWorkspaces } from "../packages/runtime-client/src/testing/directory-workspaces";
import { journalPath } from "../packages/runtime-client/src/testing/journal-path";
import { BOT_RUNNER_HEALTH_PORT, BOT_RUNNER_TOKEN } from "./bot-runner-config";
import { FakeDesktop, HEIGHT, WIDTH } from "./fake-desktop";

const url = process.env.AVEN_URL ?? "http://localhost:8100";

type Desktop = NonNullable<ReturnType<ThreadWorkspaces["desktop"]>>;

// A desktop a viewer can connect to: the RFB server answers the bytes it is written.
function pretendDesktop() {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const rfb = new FakeDesktop(
    (bytes) => void writer.write(bytes).catch(() => undefined),
    () => undefined,
  );
  const tunnel = {
    port: 5900,
    write: async (data: Uint8Array) => rfb.feed(data),
    output: stream.readable,
    close: () => void writer.close().catch(() => undefined),
    exit: new Promise<never>(() => undefined),
  };
  return {
    openViewer: async () => tunnel,
    status: async () => ({
      state: "running" as const,
      width: WIDTH,
      height: HEIGHT,
      control: { held: false },
    }),
    takeover: async () => ({ held: true, holder: "me" }),
    release: async () => ({ held: false }),
  } as unknown as Desktop;
}

// A shell that shows a prompt and answers each line with `ran: <line>`, on the pseudo-terminal the
// runner gives it, which echoes what is typed.
const PRETEND_SHELL =
  'printf "fake$ "; while IFS= read -r line; do echo "ran: $line"; printf "fake$ "; done';

const running = new Set<string>();
const workspaces = directoryWorkspaces();
const sandbox: ThreadWorkspaces = {
  ...workspaces,
  async acquire(thread, repo) {
    const box = await workspaces.acquire(thread, repo);
    return { ...box, start: async () => void running.add(thread.id) };
  },
  desktop: (id) => (running.has(id) ? pretendDesktop() : undefined),
  shell: (id) =>
    running.has(id)
      ? { argv: ["sh", "-c", PRETEND_SHELL], env: { TERM: "xterm-256color" }, hangup: ["true"] }
      : undefined,
  async release(id) {
    running.delete(id);
    await workspaces.release(id);
  },
};

const runtime = startRuntime({
  url: `${url.replace(/^http/, "ws")}/runtimes/connect`,
  token: BOT_RUNNER_TOKEN,
  sandbox,
  journalPath: journalPath(),
});
await runtime.ready;

Bun.serve({ port: BOT_RUNNER_HEALTH_PORT, fetch: () => new Response("ok") });
console.log(`bot runner connected to ${url}`);

const stop = async () => {
  await runtime.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
