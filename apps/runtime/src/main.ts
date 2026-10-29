import { startRuntime } from "@aven/runtime-client/runner";
import { Sandboxes } from "@aven/runtime-client/sandbox";

// A runtime: connects out to a control plane and runs agents on this machine. Create one in the
// control plane's settings to get its token (shown once), then:
//   AVEN_URL=https://aven.example.com AVEN_RUNTIME_TOKEN=avrt_... bun run start
const base = process.env.AVEN_URL;
const token = process.env.AVEN_RUNTIME_TOKEN;
if (!base || !token) {
  console.error("Set AVEN_URL and AVEN_RUNTIME_TOKEN.");
  process.exit(1);
}

const url = `${base.replace(/^http/, "ws").replace(/\/$/, "")}/runtimes/connect`;
// With a sandbox image, every command the agent runs happens in a container (decision 0009).
// Without one they run directly on this machine, as the user running this process.
const image = process.env.AVEN_SANDBOX_IMAGE;
const number = (value: string | undefined) => (value ? Number(value) : undefined);
const sandbox = image
  ? await Sandboxes.start({
      image,
      memoryMb: number(process.env.AVEN_SANDBOX_MEMORY_MB),
      cpus: number(process.env.AVEN_SANDBOX_CPUS),
    })
  : undefined;
if (!sandbox) {
  console.warn(
    "No AVEN_SANDBOX_IMAGE set: the agent's commands run directly on this machine, as you.",
  );
}

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
