// A runner for the bots' e2e (decision 0059): the real runner, with each bot's computer a temporary
// directory instead of a container, so no Docker. Its agent reaches the model through the control
// plane's gateway, as in production, and the person's provider is the pretend model (e2e/fake-model.ts).
import { startRuntime } from "../packages/runtime-client/src/runner";
import { directoryWorkspaces } from "../packages/runtime-client/src/testing/directory-workspaces";
import { journalPath } from "../packages/runtime-client/src/testing/journal-path";
import { BOT_RUNNER_HEALTH_PORT, BOT_RUNNER_TOKEN } from "./bot-runner-config";

const url = process.env.AVEN_URL ?? "http://localhost:8100";

const runtime = startRuntime({
  url: `${url.replace(/^http/, "ws")}/runtimes/connect`,
  token: BOT_RUNNER_TOKEN,
  sandbox: directoryWorkspaces(),
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
