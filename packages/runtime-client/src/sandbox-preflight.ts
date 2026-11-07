import { asRecord } from "@aven/agents/values";
import type { HostCommands, PreflightConfig } from "./types";

const PLATFORM_PATTERN = /^linux\/(amd64|arm64)(\/v\d+)?$/;
const RUNTIME_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/i;

function safeJson(text: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return {};
  }
}

export async function preflight(
  config: PreflightConfig,
  { docker: run, git: gitRun }: HostCommands,
) {
  const check = await run(["image", "inspect", config.image]).catch(() => ({
    code: 1,
    stdout: "",
    stderr: "docker is not installed or not running",
  }));
  if (check.code !== 0) {
    throw new Error(
      `The sandbox image ${config.image} is not available (${check.stderr.trim() || "unknown error"}). ` +
        `Docker must be running; build the image with: docker build -t ${config.image} apps/runtime/sandbox-image`,
    );
  }
  const gitCheck = await gitRun(["--version"], { cwd: "." }).catch(() => ({
    code: 1,
    stdout: "",
    stderr: "git is not installed",
  }));
  if (gitCheck.code !== 0) {
    throw new Error("git is required to clone each thread's repository but was not found");
  }
  if (config.platform !== undefined && !PLATFORM_PATTERN.test(config.platform)) {
    throw new Error(
      `The sandbox platform "${config.platform}" is not one Docker knows; use linux/amd64 or linux/arm64`,
    );
  }
  if (config.runtime !== undefined) {
    if (!RUNTIME_PATTERN.test(config.runtime)) {
      throw new Error(`The sandbox runtime "${config.runtime}" is not a Docker runtime name`);
    }
    const info = await run(["info", "--format", "{{json .Runtimes}}"]);
    const registered: Record<string, unknown> = info.code === 0 ? safeJson(info.stdout) : {};
    if (!(config.runtime in registered)) {
      throw new Error(
        `The Docker daemon has no runtime "${config.runtime}" (AVEN_SANDBOX_RUNTIME); for gVisor, install runsc and register it with \`runsc install\`, then restart Docker`,
      );
    }
  }
}
