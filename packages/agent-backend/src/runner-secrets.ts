import type { RunEnvVar } from "@aven/protocol/types";

const SECRET_NAME = /^AVEN_|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|_TOKEN$|^DATABASE_URL$/i;

export function withoutRunnerSecrets(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && !SECRET_NAME.test(name)) kept[name] = value;
  }
  return kept;
}

export function hostedProcessEnv(options: {
  inherited?: Record<string, string | undefined>;
  project: readonly RunEnvVar[];
  blockedPrefixes: readonly string[];
  overrides: Record<string, string>;
}): Record<string, string> {
  const fromProject: Record<string, string> = {};
  for (const { name, value } of options.project) {
    const upper = name.toUpperCase();

    if (!options.blockedPrefixes.some((prefix) => upper.startsWith(prefix))) {
      fromProject[name] = value;
    }
  }
  return {
    ...withoutRunnerSecrets(options.inherited ?? process.env),
    ...fromProject,
    ...options.overrides,
  };
}
