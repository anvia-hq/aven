import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { capture, dockerProblem, exec } from "../compose";
import { parseEnv } from "../env-file";
import { describeExposure, describeSignups } from "../exposure";
import { waitForHealthy } from "../health";
import { runnerEnvFile, serverDir } from "../home";
import { serviceManager } from "../service-manager";
import { API_PORT } from "../server-plan";
import { version } from "../version";

// A warning is worth reading but not a failure: a server open on a network is a choice.
type Check = { name: string; ok: boolean; detail: string; warn?: boolean };

/** Looks at everything Aven needs on this machine and says what is wrong. Exits non-zero when something is. */
export async function doctor() {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const warnUnless = (name: string, ok: boolean, detail: string) =>
    checks.push({ name, ok, detail, warn: true });

  add("aven", true, version);
  const docker = await dockerProblem();
  add("docker", docker === undefined, docker ?? (await capture(["docker", "--version"])) ?? "");
  const git = await capture(["git", "--version"]);
  add(
    "git",
    git !== undefined,
    git ?? "Not installed. A runner clones each project's repository with it.",
  );

  const serverEnv = await readEnv(join(serverDir(), ".env"));
  if (serverEnv) {
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

  const runnerEnv = await readEnv(runnerEnvFile());
  if (runnerEnv) {
    const status = await serviceManager({
      launchdLabel: "dev.anvia.aven-runner",
      systemdUnit: "aven-runner",
    }).status();
    add("runner", status.startsWith("running"), `${status}, connects to ${runnerEnv.AVEN_URL}`);
    const image = runnerEnv.AVEN_SANDBOX_IMAGE ?? "";
    const has = (await exec(["docker", "image", "inspect", image])).code === 0;
    add(
      "sandbox image",
      has,
      has ? image : `${image} is not on this machine. Pull it: docker pull ${image}`,
    );
  }
  if (!serverEnv && !runnerEnv)
    add("install", false, "Neither a server nor a runner is installed here. Run: aven install");

  for (const { name, ok, detail, warn } of checks) {
    let label = "FAIL";
    if (ok) label = "ok  ";
    else if (warn) label = "warn";
    console.log(`${label} ${name.padEnd(14)} ${detail}`);
  }
  if (checks.some((check) => !check.ok && !check.warn)) process.exit(1);
}

// What the server itself says about sign-ups, as the register page asks; undefined when it does not say.
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
