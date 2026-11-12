import { runRunner } from "@aven/runtime-client/run-runner";

const base = process.env.AVEN_URL;
const token = process.env.AVEN_RUNTIME_TOKEN;

if (!base || !token) {
  console.error("Set AVEN_URL and AVEN_RUNTIME_TOKEN.");
  process.exit(1);
}

await runRunner({ base, token });
