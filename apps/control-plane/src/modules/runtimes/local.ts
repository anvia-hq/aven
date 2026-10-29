import { startRuntime } from "@aven/runtime-client/runner";
import { Sandboxes } from "@aven/runtime-client/sandbox";

import { runtimesService } from "./service";

function optionalNumber(name: string) {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive number, got "${value}"`);
  return parsed;
}

// The control plane is a runner too: it hosts sandboxes on its own machine, so a project works
// with no runner set up (decision 0010). It connects to itself like any other runner, through the
// WebSocket, with a token that exists only in this process. Like any runner it needs Docker and
// the sandbox image; without them it stays offline and says why. `AVEN_LOCAL_RUNNER=off` turns it
// off.
export async function startLocalRunner(port: number) {
  if (process.env.AVEN_LOCAL_RUNNER === "off") return undefined;
  // Read before anything starts, so a bad value fails loudly instead of reading as "offline".
  const memoryMb = optionalNumber("AVEN_SANDBOX_MEMORY_MB");
  const cpus = optionalNumber("AVEN_SANDBOX_CPUS");
  await runtimesService.ensureLocal();

  try {
    const sandbox = await Sandboxes.start({
      image: process.env.AVEN_SANDBOX_IMAGE || "aven-sandbox-desktop:dev",
      home: process.env.AVEN_RUNTIME_HOME || undefined,
      memoryMb,
      cpus,
    });
    return startRuntime({
      url: `ws://localhost:${port}/runtimes/connect`,
      token: runtimesService.localToken,
      sandbox,
    });
  } catch (error) {
    console.warn(
      `The control plane's own runner is offline: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}
