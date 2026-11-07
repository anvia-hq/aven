import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";

import { exec } from "./compose";
import { launchdPlist, systemdUnit } from "./service-files";
import { withUserBus } from "./user-bus";
import type { ServiceManager } from "./types";

async function mustRun(command: string[], env?: Record<string, string | undefined>) {
  const { code, out } = await exec(command, env);
  if (code !== 0) throw new Error(`${command.slice(0, 2).join(" ")} failed: ${out}`);
}

function launchd(label: string): ServiceManager {
  const domain = `gui/${process.getuid?.() ?? 501}`;
  const target = `${domain}/${label}`;
  const plist = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
  const loaded = async () => (await exec(["launchctl", "print", target])).code === 0;
  const unload = async () => {
    await exec(["launchctl", "bootout", target]);
    for (let waited = 0; waited < 10_000 && (await loaded()); waited += 200) await Bun.sleep(200);
  };
  return {
    async install(def) {
      await mkdir(dirname(plist), { recursive: true });
      await mkdir(dirname(def.logFile), { recursive: true });
      await writeFile(plist, launchdPlist(def));
      await unload();
      await mustRun(["launchctl", "bootstrap", domain, plist]);
    },
    async uninstall() {
      await unload();
      await rm(plist, { force: true });
    },
    async start() {
      if (await loaded()) await mustRun(["launchctl", "kickstart", target]);
      else await mustRun(["launchctl", "bootstrap", domain, plist]);
    },
    stop: unload,
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
  const env = () => withUserBus(process.env, process.getuid?.());
  const ctl = (...args: string[]) => ["systemctl", "--user", ...args];
  const run = (...args: string[]) => mustRun(ctl(...args), env());
  const attempt = (...args: string[]) => exec(ctl(...args), env());
  return {
    async install(def) {
      await mkdir(dirname(file), { recursive: true });
      await mkdir(dirname(def.logFile), { recursive: true });
      await writeFile(file, systemdUnit(def));
      await run("daemon-reload");
      await run("enable", unit);
      await run("restart", unit);
      await exec(["loginctl", "enable-linger", process.env.USER ?? userInfo().username]);
    },
    async uninstall() {
      await attempt("disable", "--now", unit);
      await rm(file, { force: true });
      await attempt("daemon-reload");
    },
    start: () => run("start", unit),
    stop: () => run("stop", unit),
    restart: () => run("restart", unit),
    async status() {
      const { out } = await attempt("is-active", unit);
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
