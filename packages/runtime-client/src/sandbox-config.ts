import type { SandboxConfig } from "./types";

type Env = Record<string, string | undefined>;

function positiveNumber(env: Env, name: string) {
  const value = env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number, got "${value}".`);
  }
  return parsed;
}

export function sandboxConfigFromEnv(env: Env = process.env): SandboxConfig {
  return {
    image: env.AVEN_SANDBOX_IMAGE || "aven-sandbox-desktop:dev",
    platform: env.AVEN_SANDBOX_PLATFORM || undefined,
    runtime: env.AVEN_SANDBOX_RUNTIME || undefined,
    home: env.AVEN_RUNTIME_HOME || undefined,
    memoryMb: positiveNumber(env, "AVEN_SANDBOX_MEMORY_MB"),
    cpus: positiveNumber(env, "AVEN_SANDBOX_CPUS"),
    pidsLimit: positiveNumber(env, "AVEN_SANDBOX_PIDS_LIMIT"),
  };
}
