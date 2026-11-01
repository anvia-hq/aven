import { runRunner } from "@aven/runtime-client/run-runner";

// A runner: connects out to a control plane and hosts the sandboxes its threads run in. Create one in the
// control plane's settings to get its token (shown once), then:
//   AVEN_URL=https://aven.example.com/api AVEN_RUNTIME_TOKEN=avrt_... bun run start
// (`aven runner` installs and runs the same thing as a service, decision 0073.)
const base = process.env.AVEN_URL;
const token = process.env.AVEN_RUNTIME_TOKEN;
if (!base || !token) {
  console.error("Set AVEN_URL and AVEN_RUNTIME_TOKEN.");
  process.exit(1);
}

await runRunner({ base, token });
