import type { IdleWindows, SandboxIdle } from "./types";

const AGENT_IDLE_SECONDS = 5 * 60;

const USER_IDLE_SECONDS = 20 * 60;

const CHECK_SECONDS = 60;

export const EXTEND_EVERY_MS = 30 * 60_000;

function seconds(configured: string | undefined, fallback: number) {
  const value = Number(configured);

  return Number.isInteger(value) && value >= 1 ? value : fallback;
}

type Env = Record<string, string | undefined>;

export const idleWindows = (env: Env = process.env): IdleWindows => ({
  agentIdleMs: seconds(env.AVEN_CLOUD_AGENT_IDLE_SECONDS, AGENT_IDLE_SECONDS) * 1000,
  userIdleMs: seconds(env.AVEN_CLOUD_USER_IDLE_SECONDS, USER_IDLE_SECONDS) * 1000,
});

export const idleCheckMs = (env: Env = process.env) =>
  seconds(env.AVEN_CLOUD_IDLE_CHECK_SECONDS, CHECK_SECONDS) * 1000;

export function shouldStopSandbox({ windows, ...idle }: SandboxIdle) {
  if (idle.agentRunning) return false;

  return (
    idle.now - idle.lastAgentAt >= windows.agentIdleMs &&
    idle.now - idle.lastUserAt >= windows.userIdleMs
  );
}
