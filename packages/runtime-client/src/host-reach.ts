import { runCommand } from "./run-command";
import type { DockerRun, HostReach } from "./types";

export const REACH_TIMEOUT_SECONDS = 3;
const BLOCKED = "blocked";
const REACHABLE = "reachable";

export function reachCheckScript(host: string, port: number) {
  return `timeout ${REACH_TIMEOUT_SECONDS} bash -c 'echo > /dev/tcp/${host}/${port}' 2>/dev/null && echo ${REACHABLE} || echo ${BLOCKED}`;
}

export function reachAdvice(host: string, port: number) {
  return `A sandbox cannot reach the runner at ${host}:${port}, so its tools cannot start. A firewall on this machine is probably dropping what a container sends to it. On Linux with ufw: sudo ufw allow in on docker0`;
}

export function reachBlocked(result: { code: number; stdout: string }) {
  return result.code === 0 && result.stdout.trim() === BLOCKED;
}

export async function containerReachesHost(
  docker: DockerRun,
  container: string,
  host: string,
  port: number,
): Promise<boolean> {
  const result = await docker(["exec", container, "bash", "-c", reachCheckScript(host, port)], {
    timeoutMs: (REACH_TIMEOUT_SECONDS + 5) * 1000,
  }).catch(() => ({ code: 1, stdout: "" }));
  return !reachBlocked(result);
}

export async function checkSandboxReach(
  options: {
    image: string;
    platform?: string;
    runtime?: string;
    host?: string;
  },
  docker: DockerRun = (args, run) => runCommand(["docker", ...args], run),
): Promise<HostReach> {
  const host = options.host ?? "host.docker.internal";
  const listener = Bun.listen({ hostname: "0.0.0.0", port: 0, socket: { data() {} } });
  try {
    const args = ["run", "--rm", "--add-host", `${host}:host-gateway`];
    if (options.runtime) args.push("--runtime", options.runtime);
    if (options.platform) args.push("--platform", options.platform);
    args.push(options.image, "bash", "-c", reachCheckScript(host, listener.port));
    const result = await docker(args, { timeoutMs: 120_000 });
    if (reachBlocked(result)) return { ok: false, detail: reachAdvice(host, listener.port) };
    if (result.code === 0) return { ok: true, detail: "a container reaches this machine" };
    return {
      ok: true,
      detail: `could not run the check (exit ${result.code}): ${result.stderr.trim()}`,
      skipped: true,
    };
  } finally {
    listener.stop(true);
  }
}
