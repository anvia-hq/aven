import { openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { avenHome, logsDir } from "./home";
import { withUserBus } from "./user-bus";

export function updateCommand(execPath: string, release: string | undefined) {
  const command = [execPath, "update"];

  if (release) command.push("--release", release);

  return command;
}

export async function startDetachedUpdate(
  release: string | undefined,
  home = avenHome(),
  execPath = process.execPath,
) {
  const command = updateCommand(execPath, release);

  if (process.platform === "linux") {
    const unit = `aven-update-${Date.now()}`;
    const started = Bun.spawnSync(
      ["systemd-run", "--user", "--collect", "--quiet", `--unit=${unit}`, "--", ...command],
      { env: withUserBus(process.env, process.getuid?.()), stdout: "ignore", stderr: "ignore" },
    );

    if (started.exitCode === 0) return;
  }

  await mkdir(logsDir(home), { recursive: true });
  const log = openSync(join(logsDir(home), "update.log"), "a");
  Bun.spawn(command, {
    detached: true,
    stdin: "ignore",
    stdout: log,
    stderr: log,
    env: { ...process.env, AVEN_HOME: home },
  }).unref();
}
