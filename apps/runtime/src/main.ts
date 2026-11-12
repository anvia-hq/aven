import { forwardMcp } from "@aven/runtime-client/codex-mcp-bridge";
import { runRunner } from "@aven/runtime-client/run-runner";

const bridgeAt = process.argv.indexOf("--codex-mcp-bridge");

if (bridgeAt !== -1) {
  await forwardMcp(process.argv[bridgeAt + 1] ?? "");
  process.exit(0);
}

const base = process.env.AVEN_URL;
const token = process.env.AVEN_RUNTIME_TOKEN;

if (!base || !token) {
  console.error("Set AVEN_URL and AVEN_RUNTIME_TOKEN.");
  process.exit(1);
}

await runRunner({ base, token });
