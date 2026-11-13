import { startRuntime } from "../packages/runtime-client/src/runner";
import { directoryWorkspaces } from "../packages/runtime-client/src/testing/directory-workspaces";
import { journalPath } from "../packages/agent-backend/src/testing/journal-path";
import { BOT_RUNNER_HEALTH_PORT, BOT_RUNNER_TOKEN } from "./bot-runner-config";

const url = process.env.AVEN_URL ?? "http://localhost:8100";
const healthPort = Number(process.env.E2E_BOT_RUNNER_PORT ?? BOT_RUNNER_HEALTH_PORT);

const sandbox = directoryWorkspaces();

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
