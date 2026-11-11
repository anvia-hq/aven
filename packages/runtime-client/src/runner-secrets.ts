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
