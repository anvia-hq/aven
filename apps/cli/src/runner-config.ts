import { readFile } from "node:fs/promises";
import { delimiter } from "node:path";

import { parseEnv, setEnv, writePrivateFile } from "./env-file";
import type { RunnerSettings } from "./types";

const HEADER = `# The settings of this machine's Aven runner, written by \`aven runner install\`.
# Other AVEN_RUNTIME_HOME settings (see .env.example in the repository) can be
# added here; \`aven runner restart\` applies a change.
`;

export async function writeRunnerEnv(file: string, settings: RunnerSettings) {
  const existing = await readFile(file, "utf8").catch(() => HEADER);
  const values: Record<string, string> = {
    AVEN_URL: settings.url,
    AVEN_RUNTIME_TOKEN: settings.token,
    AVEN_DIRS: settings.dirs.join(delimiter),
  };
  await writePrivateFile(file, setEnv(existing, values));
}

export async function loadRunnerEnv(
  file: string,
  env: Record<string, string | undefined> = process.env,
) {
  const text = await readFile(file, "utf8").catch(() => undefined);

  if (text === undefined) return false;

  for (const [key, value] of Object.entries(parseEnv(text))) env[key] ??= value;
  return true;
}
