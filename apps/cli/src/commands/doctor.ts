import { readFile, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";

import compose from "../../../../deploy/docker-compose.yml" with { type: "text" };
import { capture, dockerProblem } from "../compose";
import { parseEnv } from "../env-file";
import { describeExposure, describeSignups } from "../exposure";
import { waitForHealthy } from "../health";
import { avenHome, runnerEnvFile, serverDir } from "../home";
import { pendingUpdateFile, readPendingUpdate } from "../pending-update";
import { serviceManager } from "../service-manager";
import { serviceUnitState } from "../service-unit";
import { API_PORT } from "../server-plan";
import { version } from "../version";

type Check = { name: string; ok: boolean; detail: string; warn?: boolean };

const names = { launchdLabel: "dev.anvia.aven-runner", systemdUnit: "aven-runner" };

export async function doctor() {
  const checks = await diagnose();
  for (const { name, ok, detail, warn } of checks) {
    let label = "FAIL";

    if (ok) label = "ok  ";
    else if (warn) label = "warn";

    console.log(`${label} ${name.padEnd(14)} ${detail}`);
  }

  if (checks.some((check) => !check.ok && !check.warn)) process.exit(1);
}

export async function diagnose(
  options: {
    home?: string;
    unitHome?: string;
    binary?: string;
    execPath?: string;
    platform?: NodeJS.Platform;
    checkDocker?: () => Promise<string | undefined>;
    checkGit?: () => Promise<string | undefined>;
  } = {},
): Promise<Check[]> {
  const home = options.home ?? avenHome();
  const binary = options.binary ?? version;
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;

  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const warnUnless = (name: string, ok: boolean, detail: string) =>
    checks.push({ name, ok, detail, warn: true });

  add("aven", true, `${binary} at ${execPath}`);
  const pending = await readPendingUpdate(pendingUpdateFile(home));

  if (pending) warnUnless("update", false, pendingUpdateDetail(pending));

  const git = await (options.checkGit?.() ?? capture(["git", "--version"]));
  add("git", git !== undefined, git ?? "Not installed. A runner works on its folders with it.");

  const dir = serverDir(home);
  const serverEnv = await readEnv(join(dir, ".env"));

  if (serverEnv) {
    const docker = options.checkDocker ? await options.checkDocker() : await dockerProblem();
    add("docker", docker === undefined, docker ?? (await capture(["docker", "--version"])) ?? "");
    for (const check of await releaseChecks(dir, serverEnv, binary)) checks.push(check);
    const url = `http://localhost:${serverEnv.AVEN_API_PORT || API_PORT}/health`;
    const answers = await waitForHealthy(url, { timeoutMs: 0 });
    add(
      "server",
      answers,
      answers
        ? `answers at ${serverEnv.BETTER_AUTH_URL}`
        : `does not answer at ${url}. See: aven server logs`,
    );
    const exposure = describeExposure(serverEnv);
    warnUnless("exposure", exposure.ok, exposure.detail);
    const registrationEnabled = answers ? await registrationIsOpen(serverEnv) : undefined;

    if (registrationEnabled !== undefined) {
      const signups = describeSignups(exposure, serverEnv, registrationEnabled);
      warnUnless("sign-ups", signups.ok, signups.detail);
    }
  }

  const runnerEnv = await readEnv(runnerEnvFile(home));

  if (runnerEnv) {
    const status = await serviceManager(names).status();
    add("runner", status.startsWith("running"), `${status}, connects to ${runnerEnv.AVEN_URL}`);
    const unit = await runnerUnitCheck({ platform, execPath, unitHome: options.unitHome });

    if (unit) checks.push(unit);

    const dirs = (runnerEnv.AVEN_DIRS ?? "").split(delimiter).filter(Boolean);

    if (dirs.length === 0) {
      warnUnless("folders", false, "The runner serves no folder: set AVEN_DIRS in its settings");
    } else {
      const missing: string[] = [];
      for (const dir of dirs)
        if (!(await stat(dir).catch(() => undefined))?.isDirectory()) missing.push(dir);
      add(
        "folders",
        missing.length === 0,
        missing.length === 0 ? dirs.join(", ") : `Not found on this machine: ${missing.join(", ")}`,
      );
    }
  }

  if (!serverEnv && !runnerEnv) {
    add("install", false, "Neither a server nor a runner is installed here. Run: aven install");
  }

  return checks;
}

async function releaseChecks(
  dir: string,
  serverEnv: Record<string, string>,
  binary: string,
): Promise<Check[]> {
  const checks: Check[] = [];
  const release = serverEnv.AVEN_VERSION;

  if (release !== undefined && binary !== "dev") {
    const ok = release === binary;
    checks.push({
      name: "server release",
      ok,
      warn: !ok,
      detail: ok
        ? `${release}, as this aven`
        : `The server runs ${release} but this aven is ${binary}. Run: aven update`,
    });
  }

  const installed = await readFile(join(dir, "docker-compose.yml"), "utf8").catch(() => undefined);

  if (installed !== undefined) {
    const ok = installed === compose;
    checks.push({
      name: "compose file",
      ok,
      warn: !ok,
      detail: ok
        ? "is this aven's own"
        : `The compose file in ${dir} is not this aven's. Run: aven update`,
    });
  }

  return checks;
}

async function runnerUnitCheck(options: {
  platform: NodeJS.Platform;
  execPath: string;
  unitHome: string | undefined;
}): Promise<Check | undefined> {
  const state = await serviceUnitState({
    platform: options.platform,
    names,
    execPath: options.execPath,
    home: options.unitHome,
  });

  if (state === undefined) return undefined;

  if (state.problem === undefined)
    return { name: "runner unit", ok: true, detail: `${state.program} (${state.file})` };

  return {
    name: "runner unit",
    ok: false,
    warn: true,
    detail: `${state.problem}. Run: aven runner install`,
  };
}

function pendingUpdateDetail(pending: { to: string; at: string }) {
  const began = pending.at === "" ? "" : ` that began at ${pending.at}`;
  return `An update to aven ${pending.to}${began} did not finish, so the server and the runner are still behind. Run: aven update`;
}

async function registrationIsOpen(env: Record<string, string>) {
  try {
    const response = await fetch(
      `http://localhost:${env.AVEN_API_PORT || API_PORT}/platform/config`,
      {
        signal: AbortSignal.timeout(3000),
      },
    );
    const body = (await response.json()) as { registrationEnabled?: unknown };
    return typeof body.registrationEnabled === "boolean" ? body.registrationEnabled : undefined;
  } catch {
    return undefined;
  }
}

async function readEnv(file: string) {
  const text = await readFile(file, "utf8").catch(() => undefined);
  return text === undefined ? undefined : parseEnv(text);
}
