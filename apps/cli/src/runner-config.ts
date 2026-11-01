import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { parseEnv, setEnv } from "./env-file";

export type RunnerSettings = { url: string; token: string; image: string };

const HEADER = `# The settings of this machine's Aven runner, written by \`aven runner install\`.
# Other AVEN_SANDBOX_* and AVEN_RUNTIME_HOME settings (see .env.example in the repository) can be
# added here; \`aven runner restart\` applies a change.
`;

/** Writes the runner's settings, keeping any other line a person added to an existing file. Readable by its owner only: it holds the token. */
export async function writeRunnerEnv(file: string, settings: RunnerSettings) {
  const existing = await readFile(file, "utf8").catch(() => HEADER);
  const text = setEnv(existing, {
    AVEN_URL: settings.url,
    AVEN_RUNTIME_TOKEN: settings.token,
    AVEN_SANDBOX_IMAGE: settings.image,
  });
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text, { mode: 0o600 });
  await chmod(file, 0o600);
}

/** Puts the file's settings in the environment, except those the environment already has: a runner started by hand with its own AVEN_URL keeps it. */
export async function loadRunnerEnv(
  file: string,
  env: Record<string, string | undefined> = process.env,
) {
  const text = await readFile(file, "utf8").catch(() => undefined);
  if (text === undefined) return false;
  for (const [key, value] of Object.entries(parseEnv(text))) env[key] ??= value;
  return true;
}
