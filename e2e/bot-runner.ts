import { startRuntime } from "../packages/runtime-client/src/runner";
import { directoryWorkspaces } from "../packages/runtime-client/src/testing/directory-workspaces";
import { journalPath } from "../packages/runtime-client/src/testing/journal-path";
import { BOT_RUNNER_HEALTH_PORT, BOT_RUNNER_TOKEN } from "./bot-runner-config";
import { FakeDesktop, HEIGHT, WIDTH } from "./fake-desktop";
import type { ThreadWorkspaces } from "../packages/runtime-client/src/types";

const url = process.env.AVEN_URL ?? "http://localhost:8100";
const healthPort = Number(process.env.E2E_BOT_RUNNER_PORT ?? BOT_RUNNER_HEALTH_PORT);

type Desktop = NonNullable<ReturnType<ThreadWorkspaces["desktop"]>>;

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

const running = new Set<string>();
const workspaces = directoryWorkspaces();
const sandbox: ThreadWorkspaces = {
  ...workspaces,
  async acquire(thread, repo) {
    const box = await workspaces.acquire(thread, repo);
    return { ...box, start: async () => void running.add(thread.id) };
  },
  desktop: (id) => (running.has(id) ? pretendDesktop() : undefined),
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

Bun.serve({ port: healthPort, fetch: () => new Response("ok") });
console.log(`bot runner connected to ${url}`);

const stop = async () => {
  await runtime.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
