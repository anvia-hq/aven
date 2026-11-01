import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { capture, dockerProblem, exec } from "../compose";
import { parseEnv } from "../env-file";
import { waitForHealthy } from "../health";
import { runnerEnvFile, serverDir } from "../home";
import { serviceManager } from "../service-manager";
import { version } from "../version";

type Check = { name: string; ok: boolean; detail: string };

/** Looks at everything Aven needs on this machine and says what is wrong. Exits non-zero when something is. */
export async function doctor() {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

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
    const url = `http://localhost:${serverEnv.AVEN_PORT || 3000}/api/health`;
    const answers = await waitForHealthy(url, { timeoutMs: 0 });
    add(
      "server",
      answers,
      answers
        ? `answers at ${serverEnv.BETTER_AUTH_URL}`
        : `does not answer at ${url}. See: aven server logs`,
    );
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

  for (const { name, ok, detail } of checks)
    console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(14)} ${detail}`);
  if (checks.some((check) => !check.ok)) process.exit(1);
}

async function readEnv(file: string) {
  const text = await readFile(file, "utf8").catch(() => undefined);
  return text === undefined ? undefined : parseEnv(text);
}
