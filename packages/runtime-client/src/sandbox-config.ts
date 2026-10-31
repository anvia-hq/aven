import type { SandboxConfig } from "./sandbox";

type Env = Record<string, string | undefined>;

// An unset variable is fine; a set one that is not a positive number is a mistake worth stopping for.
function positiveNumber(env: Env, name: string) {
  const value = env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number, got "${value}".`);
  }
  return parsed;
}

/**
 * A runner's sandboxes as the environment sets them up, for `apps/runtime` and the control plane's
 * own runner alike (decisions 0016 and 0037). Throws on a limit that is set but not a positive number.
 */
export function sandboxConfigFromEnv(env: Env = process.env): SandboxConfig {
  return {
    // Every thread runs in its own container (decision 0010): there is no mode without the image.
    image: env.AVEN_SANDBOX_IMAGE || "aven-sandbox-desktop:dev",
    platform: env.AVEN_SANDBOX_PLATFORM || undefined,
    runtime: env.AVEN_SANDBOX_RUNTIME || undefined,
    home: env.AVEN_RUNTIME_HOME || undefined,
    memoryMb: positiveNumber(env, "AVEN_SANDBOX_MEMORY_MB"),
    cpus: positiveNumber(env, "AVEN_SANDBOX_CPUS"),
    pidsLimit: positiveNumber(env, "AVEN_SANDBOX_PIDS_LIMIT"),
  };
}
