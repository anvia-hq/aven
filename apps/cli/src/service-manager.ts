import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { exec } from "./compose";
import { launchdPlist, systemdUnit, type ServiceDefinition } from "./service-files";

/** A background service of the person's own: a launchd agent on macOS, a systemd user unit on Linux. */
export type ServiceManager = {
  /** Writes the service's files and starts it on them, or starts it again if it was running. */
  install(def: ServiceDefinition): Promise<void>;
  uninstall(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  /** A word for what it is doing, such as "running" or "not installed". */
  status(): Promise<string>;
};

async function mustRun(command: string[]) {
  const { code, out } = await exec(command);
  if (code !== 0) throw new Error(`${command.slice(0, 2).join(" ")} failed: ${out}`);
}

function launchd(label: string): ServiceManager {
  const domain = `gui/${process.getuid?.() ?? 501}`;
  const target = `${domain}/${label}`;
  const plist = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
  const loaded = async () => (await exec(["launchctl", "print", target])).code === 0;
  return {
    async install(def) {
      await mkdir(dirname(plist), { recursive: true });
      await mkdir(dirname(def.logFile), { recursive: true });
      await writeFile(plist, launchdPlist(def));
      await exec(["launchctl", "bootout", target]);
      await mustRun(["launchctl", "bootstrap", domain, plist]);
    },
    async uninstall() {
      await exec(["launchctl", "bootout", target]);
      await rm(plist, { force: true });
    },
    async start() {
      if (await loaded()) await mustRun(["launchctl", "kickstart", target]);
      else await mustRun(["launchctl", "bootstrap", domain, plist]);
    },
    async stop() {
      await exec(["launchctl", "bootout", target]);
    },
    async restart() {
      if (await loaded()) await mustRun(["launchctl", "kickstart", "-k", target]);
      else await mustRun(["launchctl", "bootstrap", domain, plist]);
    },
    async status() {
      const { code, out } = await exec(["launchctl", "print", target]);
      if (code !== 0) return "stopped";
      const pid = /\bpid = (\d+)/.exec(out)?.[1];
      return pid ? `running (pid ${pid})` : "loaded, not running";
    },
  };
}

function systemd(unit: string): ServiceManager {
  const file = join(homedir(), ".config", "systemd", "user", `${unit}.service`);
  const ctl = (...args: string[]) => ["systemctl", "--user", ...args];
  return {
    async install(def) {
      await mkdir(dirname(file), { recursive: true });
      await mkdir(dirname(def.logFile), { recursive: true });
      await writeFile(file, systemdUnit(def));
      await mustRun(ctl("daemon-reload"));
      await mustRun(ctl("enable", unit));
      // Restarted, so a service that was already running moves to the new files.
      await mustRun(ctl("restart", unit));
      // Without lingering the service stops when the person logs out. It may need a password or not exist; the service still works while logged in.
      await exec(["loginctl", "enable-linger", process.env.USER ?? ""]);
    },
    async uninstall() {
      await exec(ctl("disable", "--now", unit));
      await rm(file, { force: true });
      await exec(ctl("daemon-reload"));
    },
    start: () => mustRun(ctl("start", unit)),
    stop: () => mustRun(ctl("stop", unit)),
    restart: () => mustRun(ctl("restart", unit)),
    async status() {
      const { out } = await exec(ctl("is-active", unit));
      return out === "active" ? "running" : out || "not installed";
    },
  };
}

export function serviceManager(names: {
  launchdLabel: string;
  systemdUnit: string;
}): ServiceManager {
  if (process.platform === "darwin") return launchd(names.launchdLabel);
  if (process.platform === "linux") return systemd(names.systemdUnit);
  throw new Error(
    `Running a service is not supported on ${process.platform} yet; run \`aven runner run\` in a terminal.`,
  );
}
