import { openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { avenHome, logsDir } from "./home";
import { withUserBus } from "./user-bus";

/** The command that updates this machine to a release, or to the latest without one. */
export function updateCommand(execPath: string, release: string | undefined) {
  const command = [execPath, "update"];
  if (release) command.push("--release", release);
  return command;
}

// Starts `aven update` so that it outlives the runner it is about to restart (decision 0146): the
// update ends with the service restarting, which stops everything the service started. On Linux the
// update runs as a transient unit of the user's systemd, outside the runner's own; where that is not
// possible, or on macOS (launchd stops the service's process group, which a new session leaves),
// it is a process of its own in a session of its own. Its output goes to `update.log` in the logs
// directory.
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
