import { runCommand } from "./run-command";

const PROBE_TIMEOUT_MS = 5_000;

export async function readMachineGithubLogin(
  run: typeof runCommand = runCommand,
): Promise<string | null> {
  try {
    const result = await run(["gh", "api", "user", "--jq", ".login"], {
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const login = result.stdout.trim();

    if (result.code !== 0 || !/^[A-Za-z0-9-]{1,39}$/.test(login)) return null;

    return login;
  } catch {
    return null;
  }
}
