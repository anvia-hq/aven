import { startRuntime } from "@aven/runtime-client/runner";
import { Sandboxes, journalPathIn } from "@aven/runtime-client/sandbox";

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

// An unset variable is fine; a set one that is not a positive number is a mistake worth stopping for.
function positiveNumber(name: string) {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`${name} must be a positive number, got "${value}".`);
    process.exit(1);
  }
  return parsed;
}

// Stopping works whichever comes first: a signal while still connecting, or a refusal.
let runtime: ReturnType<typeof startRuntime> | undefined;
let stopping: Promise<void> | undefined;
function exit(code: number) {
  stopping ??= (async () => {
    // Background commands the agent started are process groups; stop them with the runtime.
    await runtime?.stop();
    process.exit(code);
  })();
  return stopping;
}
process.on("SIGINT", () => void exit(0));
process.on("SIGTERM", () => void exit(0));

const sandbox = await Sandboxes.start({
  image,
  platform: process.env.AVEN_SANDBOX_PLATFORM || undefined,
  runtime: process.env.AVEN_SANDBOX_RUNTIME || undefined,
  home: process.env.AVEN_RUNTIME_HOME || undefined,
  memoryMb: positiveNumber("AVEN_SANDBOX_MEMORY_MB"),
  cpus: positiveNumber("AVEN_SANDBOX_CPUS"),
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

runtime = startRuntime({
  url,
  token,
  sandbox,
  journalPath: journalPathIn(process.env.AVEN_RUNTIME_HOME || undefined),
  onRefused: (reason) => {
    console.error(`The control plane refused this runtime: ${reason}`);
    void exit(1);
  },
});

await runtime.ready;
console.log(`runtime connected to ${base}`);
