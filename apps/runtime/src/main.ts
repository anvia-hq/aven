import { startRuntime } from "@aven/runtime-client/runner";

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
const runtime = startRuntime({
  url,
  token,
  onRefused: (reason) => {
    console.error(`The control plane refused this runtime: ${reason}`);
    process.exit(1);
  },
});

await runtime.ready;
console.log(`runtime connected to ${base}`);

// Background commands the agent started are process groups; stop them with the runtime.
const shutdown = async () => {
  await runtime.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
