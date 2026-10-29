import { startRuntime } from "@aven/runtime-client/runner";
import { Sandboxes } from "@aven/runtime-client/sandbox";

// A runner: connects out to a control plane and hosts the sandboxes its threads run in. Create one in the
// control plane's settings to get its token (shown once), then:
//   AVEN_URL=https://aven.example.com AVEN_RUNTIME_TOKEN=avrt_... bun run start
const base = process.env.AVEN_URL;
const token = process.env.AVEN_RUNTIME_TOKEN;
if (!base || !token) {
  console.error("Set AVEN_URL and AVEN_RUNTIME_TOKEN.");
  process.exit(1);
}

const url = `${base.replace(/^http/, "ws").replace(/\/$/, "")}/runtimes/connect`;
// Every thread runs in its own container on this machine (decision 0010): Docker and the sandbox
// image are required, and there is no mode that runs the agent's commands directly on this machine.
const image = process.env.AVEN_SANDBOX_IMAGE || "aven-sandbox-desktop:dev";
const number = (value: string | undefined) => (value ? Number(value) : undefined);
const sandbox = await Sandboxes.start({
  image,
  home: process.env.AVEN_RUNTIME_HOME || undefined,
  memoryMb: number(process.env.AVEN_SANDBOX_MEMORY_MB),
  cpus: number(process.env.AVEN_SANDBOX_CPUS),
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

// Background commands the agent started are process groups; stop them with the runtime.
async function exit(code: number) {
  await runtime.stop();
  process.exit(code);
}

const runtime = startRuntime({
  url,
  token,
  sandbox,
  onRefused: (reason) => {
    console.error(`The control plane refused this runtime: ${reason}`);
    void exit(1);
  },
});

await runtime.ready;
console.log(`runtime connected to ${base}`);

process.on("SIGINT", () => void exit(0));
process.on("SIGTERM", () => void exit(0));
